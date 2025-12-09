import { analytics } from '$lib/features/analytics/server';
import { auth } from '$lib/server/auth';
import { createContextLogger } from '$lib/server/logger';
import type { RequestEvent } from '@sveltejs/kit';
import { waitUntil } from '@vercel/functions';

export function getBearerToken(request: Request) {
	const authorization = request.headers.get('Authorization');
	const token = authorization?.split(' ')[1];
	return token;
}

/**
 * #########
 * MIDDLEWARE
 * #########
 *
 * These are the middleware functions that are used to authenticate requests.
 * Credit-related functionality has been removed.
 */

export type RateLimitInfo = {
	limit: number;
	remaining: number;
	reset: number;
};

export async function withAuth(
	event: RequestEvent<Record<string, string>>,
	handler: (
		orgId: string,
		projectId: string,
		apiKeyId: string,
		rateLimitInfo: RateLimitInfo
	) => Promise<Response>
): Promise<Response> {
	const logger = createContextLogger('api-middleware');
	const operation = logger.start('Authenticate API request', {
		endpoint: event.url.pathname,
		method: event.request.method
	});

	operation.step('Validating authorization header');
	const authHeader = event.request.headers.get('authorization');

	if (!authHeader) {
		operation.error('Authentication failed', undefined, {
			reason: 'auth header is missing',
			statusCode: 401
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: 'auth header is missing'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	operation.step('Extracting bearer token');
	const token = authHeader.split(' ')[1];

	if (!token) {
		operation.error('Authentication failed', undefined, {
			reason: 'token is missing',
			statusCode: 401
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: 'token is missing'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	/**
	 * API Keys are bound to users, but upon creation, we enforce applying keys to an
	 * organization ID and a folder ID. Therefore, when verifying an API key, we can
	 * extract the organization ID from the key's metadata.
	 */
	operation.step('Verifying API key');
	const trimmedToken = token.trim();

	// Log token details for debugging (without exposing the full key)
	logger.info('Verifying API key details', {
		tokenLength: trimmedToken.length,
		tokenPrefix: trimmedToken.substring(0, 10),
		tokenSuffix: trimmedToken.substring(trimmedToken.length - 4)
	});

	const response = await auth.api.verifyApiKey({
		body: {
			key: trimmedToken
		}
	});

	// Log verification response details
	logger.info('API key verification response', {
		valid: response.valid,
		hasKey: !!response.key,
		hasError: !!response.error,
		errorCode: response.error?.code,
		errorMessage: response.error?.message
	});

	if (!response.valid) {
		operation.error('Authentication failed', undefined, {
			reason: response.error?.message || 'invalid token',
			code: response.error?.code,
			statusCode: 401,
			tokenLength: trimmedToken.length,
			tokenPrefix: trimmedToken.substring(0, 10)
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: response.error?.message || 'invalid token'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	operation.step('Extracting metadata from API key');
	const orgId = response.key?.metadata?.orgId;
	const projectId = response.key?.metadata?.projectId;
	const apiKeyId = response.key?.id;

	if (!orgId) {
		// Log metadata details only when there's an error
		logger.error('Missing orgId from API key metadata', undefined, {
			hasOrgId: !!orgId,
			hasProjectId: !!projectId,
			hasApiKeyId: !!apiKeyId,
			apiKeyId,
			metadataKeys: response.key?.metadata ? Object.keys(response.key.metadata) : [],
			fullMetadata: response.key?.metadata
		});

		operation.error('Authentication failed', undefined, {
			reason: 'orgId is missing from API key metadata',
			statusCode: 401,
			apiKeyId
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					apiKeyId,
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: 'orgId is missing'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	if (!projectId) {
		// Log metadata details only when there's an error
		logger.error('Missing projectId from API key metadata', undefined, {
			hasOrgId: !!orgId,
			hasProjectId: !!projectId,
			hasApiKeyId: !!apiKeyId,
			orgId,
			apiKeyId,
			metadataKeys: response.key?.metadata ? Object.keys(response.key.metadata) : [],
			fullMetadata: response.key?.metadata
		});

		operation.error('Authentication failed', undefined, {
			reason: 'projectId is missing from API key metadata',
			statusCode: 401,
			apiKeyId
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					apiKeyId,
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: 'projectId is missing'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	if (!apiKeyId) {
		operation.error('Authentication failed', undefined, {
			reason: 'apiKeyId is missing from verification response',
			statusCode: 401,
			organizationId: orgId
		});

		waitUntil(
			analytics
				.track('api_request_failed', {
					organizationId: orgId,
					endpoint: event.url.pathname,
					method: event.request.method,
					statusCode: 401,
					error: 'UNAUTHORIZED',
					reason: 'apiKeyId is missing'
				})
				.then(() => analytics.shutdown())
		);

		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'Invalid or missing authentication credentials'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	operation.end({
		organizationId: orgId,
		projectId,
		apiKeyId
	});

	waitUntil(
		analytics
			.track('api_request_authenticated', {
				organizationId: orgId,
				apiKeyId,
				endpoint: event.url.pathname,
				method: event.request.method
			})
			.then(() => analytics.shutdown())
	);

	// Extract rate limit information from the verified API key
	const rateLimitInfo: RateLimitInfo = {
		limit: response.key?.rateLimitMax ?? 100,
		remaining: response.key?.remaining ?? 100,
		reset: response.key?.lastRequest
			? Math.floor(
					(new Date(response.key.lastRequest).getTime() +
						(response.key?.rateLimitTimeWindow ?? 60000)) /
						1000
				)
			: Math.floor(Date.now() / 1000) + 60
	};

	return handler(orgId, projectId, apiKeyId, rateLimitInfo);
}
