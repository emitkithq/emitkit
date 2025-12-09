import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { createContextLogger, setRequestId } from '$lib/server/logger';
import { validateEncryptionKey } from '$lib/server/encryption';
import { randomUUID } from 'crypto';

// ============================================================================
// Startup Validation
// ============================================================================

// Validate encryption key on module load (runs once at startup)
// This ensures the application fails fast if encryption is misconfigured
if (!building) {
	try {
		validateEncryptionKey();
	} catch (error) {
		const logger = createContextLogger('startup-validation');
		logger.error('CRITICAL: Encryption key validation failed', error as Error);
		throw error; // Fail application startup
	}
}

// ============================================================================
// Utilities
// ============================================================================

function isApiSubdomain(host: string | null): boolean {
	return host?.startsWith('api.') ?? false;
}

function isAuthRoute(pathname: string): boolean {
	return pathname.startsWith('/auth');
}

function isApiRoute(pathname: string): boolean {
	return pathname.startsWith('/api');
}

function isSignInOrSignUp(pathname: string): boolean {
	return pathname === '/auth/sign-in' || pathname === '/auth/sign-up';
}

/**
 * Ensures the user has a valid active organization.
 * If the current activeOrganizationId is invalid, attempts to reset to first available org.
 */
async function ensureActiveOrganization(
	event: Parameters<Handle>[0]['event'],
	logger: ReturnType<typeof createContextLogger>
): Promise<void> {
	const session = event.locals.session;
	if (!session) return;

	const activeOrgId = session.activeOrganizationId;

	// Fetch the active organization and member relationship
	const [member, activeOrg] = await Promise.all([
		activeOrgId ? auth.api.getActiveMember({ headers: event.request.headers }) : null,
		activeOrgId
			? db.query.organization.findFirst({
					where: (organization, { eq }) => eq(organization.id, activeOrgId)
				})
			: null
	]);

	// If valid organization and member exist, set them and return
	if (activeOrgId && activeOrg && member) {
		event.locals.activeOrganization = activeOrg;
		event.locals.activeOrganizationMember = member;
		return;
	}

	// Organization or member is missing - try to fix it
	if (activeOrgId && !member) {
		// Check if member exists in DB but wasn't loaded properly
		const directMember = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(eq(m.userId, session.userId), eq(m.organizationId, activeOrgId))
		});

		if (directMember && activeOrg) {
			event.locals.activeOrganizationMember = directMember;
			event.locals.activeOrganization = activeOrg;
			return;
		}

		logger.info('User not a member of active organization, resetting to first available', {
			userId: session.userId,
			attemptedOrgId: activeOrgId
		});
	}

	// Find and set first available organization
	const firstOrg = await db.query.member.findFirst({
		where: (member, { eq }) => eq(member.userId, session.userId),
		with: { organization: true }
	});

	if (firstOrg) {
		await auth.api.setActiveOrganization({
			headers: event.request.headers,
			body: { organizationId: firstOrg.organizationId }
		});

		session.activeOrganizationId = firstOrg.organizationId;
		event.locals.activeOrganization = firstOrg.organization;
		event.locals.activeOrganizationMember = firstOrg;
	} else {
		// User has no organizations at all
		session.activeOrganizationId = undefined;
		event.locals.activeOrganization = undefined;
		event.locals.activeOrganizationMember = undefined;
	}
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Request ID Handler
 * Generates a unique request ID for each request and stores it in locals.
 */
const requestIdHandler: Handle = async ({ event, resolve }) => {
	const requestId = randomUUID();
	setRequestId(requestId);
	event.locals.requestId = requestId;
	return resolve(event);
};

/**
 * API Subdomain Handler
 * Validates requests from api.emitkit.com and ensures only /v1/* and /api/* paths are allowed.
 * Note: /v1/* paths are proxied to /api/v1/* via proxy routes in src/routes/v1/*.
 */
const apiSubdomainHandler: Handle = async ({ event, resolve }) => {
	const host = event.request.headers.get('host');

	if (!isApiSubdomain(host)) {
		return resolve(event);
	}

	const pathname = event.url.pathname;

	// Allow /v1/* (API endpoints) and /api/* (OpenAPI spec, docs, etc.)
	if (!pathname.startsWith('/v1/') && !pathname.startsWith('/api/')) {
		const logger = createContextLogger('api-subdomain-handler');
		logger.warn('Invalid API subdomain path', { host, path: pathname });

		return new Response(
			JSON.stringify({
				error: 'Not Found',
				message: 'Invalid API endpoint.'
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	return resolve(event);
};

/**
 * Better Auth Handler
 * Sets up authentication session and organization context for authenticated users.
 * Skips session logic for API subdomain and API routes (handled by API key middleware).
 */
const betterAuthHandler: Handle = async ({ event, resolve }) => {
	const logger = createContextLogger('auth-handler');
	const host = event.request.headers.get('host');
	const pathname = event.url.pathname;

	event.locals.getSession = auth.api.getSession;
	event.locals.auth = auth;

	// Skip session/org logic for API subdomain (handled by API key middleware)
	if (isApiSubdomain(host)) {
		return resolve(event);
	}

	// For Better Auth API routes, let svelteKitHandler handle it directly
	if (pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	// Skip session/org logic for public API routes (handled by API key middleware)
	if (pathname.startsWith('/api/v1')) {
		return resolve(event);
	}

	// Skip session/org logic for Upstash Workflow callbacks (authenticated via QStash signatures)
	if (pathname.includes('/api/workflows/') && pathname.endsWith('/execute')) {
		return resolve(event);
	}

	// Load session
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	// Ensure user has a valid active organization
	await ensureActiveOrganization(event, logger);

	// CRITICAL: If user has a session but no active organization, something went wrong
	if (event.locals.session && !event.locals.activeOrganization) {
		logger.error('CRITICAL: Authenticated user has no active organization', undefined, {
			userId: event.locals.session.userId,
			sessionId: event.locals.session.id,
			activeOrganizationId: event.locals.session.activeOrganizationId
		});
		throw new Error(
			'User authentication is in an invalid state. No organization found for authenticated user.'
		);
	}

	if (event.locals.session && event.locals.user) {
		event.locals.authContext = {
			userId: event.locals.user.id,
			organizationId: event.locals.session.activeOrganizationId ?? null,
			role: event.locals.activeOrganizationMember?.role ?? 'member',
			email: event.locals.user.email
		};
	}

	// svelteKitHandler internally handles Better Auth routes and passes through others
	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Guard Handler
 * Ensures proper authentication and authorization for protected routes.
 * Redirects unauthenticated users to sign-in page.
 */
const guardHandler: Handle = async ({ event, resolve }) => {
	const logger = createContextLogger('guard-handler');
	const host = event.request.headers.get('host');
	const pathname = event.url.pathname;

	// Skip guard for API subdomain (authentication handled by API key middleware)
	if (isApiSubdomain(host)) {
		return resolve(event);
	}

	// Handle auth routes
	if (isAuthRoute(pathname)) {
		// Redirect authenticated users away from sign-in/sign-up
		if (event.locals.session && isSignInOrSignUp(pathname)) {
			logger.info('Authenticated user accessing auth page, redirecting to root', {
				userId: event.locals.session.userId,
				path: pathname
			});
			redirect(302, '/');
		}
		return resolve(event);
	}

	// Skip guard for API routes (authentication handled by middleware)
	if (isApiRoute(pathname)) {
		return resolve(event);
	}

	// Require session for all other routes
	if (!event.locals.session) {
		redirect(302, '/auth/sign-in');
	}

	// Ensure active organization exists for protected routes
	if (!event.locals.activeOrganization) {
		logger.error('CRITICAL: Guard - authenticated user has no active organization', undefined, {
			userId: event.locals.session.userId,
			path: pathname
		});
		throw new Error('Cannot access protected routes without an active organization');
	}

	return resolve(event);
};

// ============================================================================
// Handler Sequence
// ============================================================================

/**
 * Handler execution order:
 * 1. requestIdHandler - Generates unique request ID
 * 2. apiSubdomainHandler - Validates api.emitkit.com requests
 * 3. betterAuthHandler - Sets up session and organization context
 * 4. guardHandler - Enforces authentication requirements
 */
export const handle = sequence(
	requestIdHandler,
	apiSubdomainHandler,
	betterAuthHandler,
	guardHandler
);
