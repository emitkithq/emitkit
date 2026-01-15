import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '$lib/server/db/index.js';
import {
	organization,
	emailOTP,
	apiKey,
	bearer,
	type Organization,
	type Member
} from 'better-auth/plugins';
import {
	ac,
	admin as adminRole,
	member as memberRole,
	owner,
	viewer
} from '$lib/client/auth/permissions.js';
import { createBetterAuthId, project } from './db/schema';
import { analytics } from '$lib/features/analytics/server';
import { createId } from '@paralleldrive/cuid2';
import { createLogger } from '$lib/server/logger';
import { siteConfig } from './site-config';
import { env } from '$env/dynamic/private';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { betterAuthApiKeySchema } from '$lib/features/api-keys/validators';
import { getProjectByIdAndOrg } from '$lib/features/projects/server/repository';

const logger = createLogger('better-auth:config');

export const auth = betterAuth({
	baseURL: siteConfig.appUrl,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema
	}),
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === '/api-key/create') {
				const body = ctx.body;
				const input = betterAuthApiKeySchema.safeParse(body);

				logger.info('Validating input for /api-key/create', { body });

				if (!input.success) {
					logger.warn('Invalid input for /api-key/create', {
						details: input.error.flatten().fieldErrors,
						body
					});

					throw new APIError('BAD_REQUEST', {
						message: 'Invalid input',
						details: input.error.flatten().fieldErrors
					});
				}

				// Validate project ownership
				const { metadata } = input.data;
				logger.info('Validating project ownership', {
					projectId: metadata.projectId,
					orgId: metadata.orgId
				});

				const project = await getProjectByIdAndOrg(metadata.projectId, metadata.orgId);

				if (!project) {
					logger.warn('Project not found or access denied', {
						projectId: metadata.projectId,
						orgId: metadata.orgId
					});

					throw new APIError('FORBIDDEN', {
						message: 'Project not found or access denied'
					});
				}

				logger.info('Project ownership validated', {
					projectId: project.id,
					projectName: project.name
				});

				return;
			}
		})
	},
	advanced: {
		database: {
			generateId: ({ model }: { model: string }) => {
				return createBetterAuthId(model);
			}
		}
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword({ user, url }) {
			const operation = logger.start('Send reset password email', {
				email: user.email
			});

			try {
				const { emailService, ResetPasswordEmail } =
					await import('$lib/features/email/server/index.js');

				await emailService.sendEmail({
					to: user.email,
					subject: `Reset your password for ${siteConfig.appName}`,
					component: ResetPasswordEmail,
					props: {
						resetPasswordURL: url
					}
				});

				operation.end({ sent: true });
			} catch (error) {
				operation.error('Failed to send reset password email', error, {
					email: user.email
				});
				// Don't throw - we don't want to break auth flow
			}
		}
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			const operation = logger.start('Send verification email', {
				email: user.email
			});

			try {
				const { emailService, ConfirmSubscriptionEmail } =
					await import('$lib/features/email/server/index.js');

				await emailService.sendEmail({
					to: user.email,
					subject: 'Verify your email address',
					component: ConfirmSubscriptionEmail,
					props: {
						verifyEmailURL: url,
						newsletterName: siteConfig.appName
					}
				});

				operation.end({ sent: true });
			} catch (error) {
				operation.error('Failed to send verification email', error, {
					email: user.email
				});
				// Don't throw - we don't want to break auth flow
			}
		},
		sendOnSignUp: false,
		autoSignInAfterVerification: true
	},
	socialProviders: {
		google: {
			clientId: '',
			clientSecret: ''
		}
	},
	plugins: [
		organization({
			ac, // Our access control instance
			roles: {
				owner,
				admin: adminRole,
				member: memberRole,
				viewer
			},
			dynamicAccessControl: {
				enabled: true // Enable dynamic role creation
			}
		}),
		apiKey({
			defaultKeyLength: 24,
			startingCharactersConfig: {
				shouldStore: true,
				charactersLength: 8 + 4
			},
			enableMetadata: true,
			defaultPrefix: 'emitkit_',
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60, // 1 minute
				maxRequests: 100 // 100 requests per minute default
			}
		}),
		bearer(),
		emailOTP({
			async sendVerificationOTP({ email, otp, type }, request) {
				const operation = logger.start('Send OTP email', {
					email,
					type
				});

				try {
					const { emailService, OTPEmail } = await import('$lib/features/email/server/index.js');

					let subject: string;
					if (type === 'sign-in') {
						subject = `Your ${siteConfig.appName} verification code`;
					} else if (type === 'email-verification') {
						subject = `Verify your ${siteConfig.appName} email`;
					} else {
						subject = `Reset your ${siteConfig.appName} password`;
					}

					// Detect if request is from mobile device
					const userAgent = request?.headers?.get('user-agent') || '';
					const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
						userAgent
					);

					await emailService.sendEmail({
						to: email,
						subject,
						component: OTPEmail,
						props: {
							email,
							otp,
							type,
							isMobile
						}
					});

					operation.end({ sent: true, isMobile });
				} catch (error) {
					operation.error('Failed to send OTP email', error, {
						email,
						type
					});
					// Don't throw - we don't want to break auth flow
				}
			},
			otpLength: 6, // 6-digit code
			expiresIn: 60 * 15 // 15 minutes
		})
		// lastLoginMethod()
		// multiSession()
	],
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const firstOrg = await db.query.member.findFirst({
						where: (member, { eq }) => eq(member.userId, session.userId),
						with: {
							organization: {
								columns: {
									id: true,
									name: true,
									slug: true
								}
							}
						}
					});

					return {
						data: {
							...session,
							organization: firstOrg?.organization,
							activeOrganizationId: firstOrg?.organizationId
						}
					};
				}
			}
		},
		user: {
			create: {
				after: async (user) => {
					// Track user signup
					analytics.track(
						'user_signed_up',
						{
							userId: user.id,
							email: user.email,
							provider: undefined
						},
						{
							userId: user.email,
							user: {
								email: user.email
							}
						}
					);

					try {
						// Create a default organization for the new user
						const defaultOrg = await createDefaultOrganization(user);

						await createDefaultSite(defaultOrg);
					} catch (error) {
						logger.error(
							'Error creating default organization or site',
							error instanceof Error ? error : undefined,
							{
								userId: user.id,
								email: user.email
							}
						);
					}
				}
			}
		},
		organization: {
			create: {
				after: async (org: { id: string; name: string }) => {
					// Create a default site for the new organization
					await createDefaultSite(org);
				}
			}
		}
	},
	trustedOrigins() {
		const baseUrls: string[] = [
			env.VERCEL_URL,
			...(env.VERCEL_PROJECT_PRODUCTION_URL ? [env.VERCEL_PROJECT_PRODUCTION_URL] : []),
			...(env.VERCEL_BRANCH_URL ? [env.VERCEL_BRANCH_URL] : [])
		].filter((url): url is string => Boolean(url));

		// In production, explicitly add all production custom domains
		if (env.VERCEL_TARGET_ENV === 'production') {
			baseUrls.push('app.emitkit.com', 'api.emitkit.com');
		}

		// Remove duplicates
		const uniqueUrls = [...new Set(baseUrls)];

		// Determine protocol based on environment
		const protocol = import.meta.env.PROD ? 'https://' : 'http://';

		// Generate origins with and without trailing slash
		const origins = uniqueUrls.flatMap((url) => [`${protocol}${url}`, `${protocol}${url}/`]);

		return origins;
	}
});

async function createDefaultOrganization(
	user: Pick<typeof auth.$Infer.Session.user, 'id' | 'email' | 'name'>
) {
	const emailToName = (email: string) => {
		const atIndex = email.indexOf('@');
		if (atIndex === -1) return email;
		return email.slice(0, atIndex).toLowerCase();
	};
	const id = createId();
	const randomString = id.slice(0, 8);
	const name = user?.name ?? emailToName(user.email);

	const now = new Date();
	const trialEndsAt = new Date(now);
	trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14 days from now

	const organization = await auth.api.createOrganization({
		body: {
			userId: user.id,
			name: 'Personal Workspace',
			slug: `personal-${name}-${randomString}`
		}
	});

	if (!organization) {
		throw new Error('Failed to create organization');
	}

	return organization;
}

async function createDefaultSite(org: { id: string; name: string }) {
	try {
		// Create the default project (without API key - will be created in onboarding)
		const [newProject] = await db
			.insert(project)
			.values({
				id: createBetterAuthId('project'),
				organizationId: org.id,
				name: 'Default Project',
				slug: 'default',
				description: 'Your first project - you can create more projects for different apps',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		if (!newProject) {
			logger.error('Failed to create default project for organization', undefined, {
				organizationId: org.id,
				organizationName: org.name
			});
			return;
		}

		logger.success('Created default project for organization', {
			organizationId: org.id,
			organizationName: org.name,
			projectId: newProject.id,
			message: 'API key will be created during user onboarding'
		});
	} catch (error) {
		logger.error('Error creating default project', error instanceof Error ? error : undefined, {
			organizationId: org.id,
			organizationName: org.name
		});
		// Don't throw - we don't want to break organization creation
	}
}

export type AuthConfig = typeof auth;
export type SessionObj = typeof auth.$Infer.Session;
export type UserObj = typeof auth.$Infer.Session.user;
export type OrganizationObj = Organization;
export type MemberObj = Member;

/**
 * Auth context for authenticated requests
 * Represents the authenticated user and their organization context
 */
export type AuthContext = {
	/** User's unique identifier */
	userId: string;
	/** Organization ID the user is operating within */
	organizationId: string | null;
	/** User's email address */
	email?: string;
	/** User's role within the organization */
	role?: string;
	/** Optional array of specific permissions */
	permissions?: string[];
};
