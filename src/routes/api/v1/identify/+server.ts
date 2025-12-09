import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/features/api/server/middleware';
import { z } from 'zod';
import { createContextLogger } from '$lib/server/logger';
import { upsertUserIdentity } from '$lib/features/identity/server/tinybird.service';
import { identifyUserSchema } from '$lib/features/identity/validators';
import { analytics } from '$lib/features/analytics/server';
import { waitUntil } from '$lib/server/wait-until';

export const POST: RequestHandler = async (event) => {
	const logger = createContextLogger('api-identify');

	return withAuth(event, async (orgId, siteId, apiKeyId, rateLimitInfo) => {
		const operation = logger.start('Identify user', {
			organizationId: orgId,
			apiKeyId
		});

		try {
			// Parse and validate the request body
			const body = await event.request.json();
			const validatedData = identifyUserSchema.parse(body);

			operation.step('Upserting user identity', {
				userId: validatedData.user_id,
				hasProperties: Object.keys(validatedData.properties || {}).length > 0,
				aliasCount: validatedData.aliases?.length || 0
			});

			// Upsert the user identity with properties and aliases in Tinybird
			const identity = await upsertUserIdentity({
				organizationId: orgId,
				userId: validatedData.user_id,
				properties: validatedData.properties || {},
				aliases: validatedData.aliases || []
			});

			operation.end({
				userId: validatedData.user_id,
				identityId: identity.id,
				aliasCount: identity.aliases.length
			});

			// Track successful identify event
			waitUntil(
				analytics
					.track('user_identified', {
						organizationId: orgId,
						apiKeyId,
						userId: validatedData.user_id,
						aliasCount: identity.aliases.length,
						hasProperties: Object.keys(validatedData.properties || {}).length > 0
					})
					.then(() => analytics.shutdown())
			);

			const responseBody = {
				success: true,
				data: {
					id: identity.id,
					userId: identity.userId,
					properties: identity.properties,
					aliases: {
						created: identity.aliases
					},
					updatedAt: identity.updatedAt
				},
				requestId: event.locals.requestId
			};

			return json(responseBody, {
				status: 200,
				headers: {
					'X-RateLimit-Limit': String(rateLimitInfo.limit),
					'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
					'X-RateLimit-Reset': String(rateLimitInfo.reset)
				}
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const userId =
				error instanceof z.ZodError
					? undefined
					: (await event.request.json().catch(() => ({}))).user_id;

			operation.error('Failed to identify user', error instanceof Error ? error : undefined, {
				organizationId: orgId,
				apiKeyId,
				userId
			});

			// Track failed identify event
			waitUntil(
				analytics
					.track('user_identify_failed', {
						organizationId: orgId,
						apiKeyId,
						userId,
						error: errorMessage,
						statusCode: error instanceof z.ZodError ? 400 : 500
					})
					.then(() => analytics.shutdown())
			);

			if (error instanceof z.ZodError) {
				return json(
					{
						success: false,
						error: 'Validation error',
						details: error.issues,
						requestId: event.locals.requestId
					},
					{
						status: 400,
						headers: {
							'X-RateLimit-Limit': String(rateLimitInfo.limit),
							'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
							'X-RateLimit-Reset': String(rateLimitInfo.reset)
						}
					}
				);
			}

			// Generic error response for any other errors
			return json(
				{
					success: false,
					error: 'Failed to identify user',
					message: errorMessage,
					requestId: event.locals.requestId
				},
				{
					status: 500,
					headers: {
						'X-RateLimit-Limit': String(rateLimitInfo.limit),
						'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
						'X-RateLimit-Reset': String(rateLimitInfo.reset)
					}
				}
			);
		}
	});
};
