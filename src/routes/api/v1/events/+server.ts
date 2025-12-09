import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAndBroadcastEvent } from '$lib/features/events/server';
import { getOrCreateChannel } from '$lib/features/channels/server/repository';
import { withAuth } from '$lib/features/api/server/middleware';
import { z } from 'zod';
import { createContextLogger } from '$lib/server/logger';
import { redis } from '$lib/server/redis';
import { resolveUserAlias } from '$lib/features/identity/server/tinybird.service';

const jsonValueSchema: z.ZodType<
	string | number | boolean | null | Array<unknown> | Record<string, unknown>
> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema)
	])
);

const createEventSchema = z.object({
	channelName: z.string(), // Changed from channelId - will auto-create if doesn't exist
	title: z.string(),
	description: z.string().optional(),
	icon: z.string().optional(),
	tags: z.array(z.string()).optional(),
	metadata: z.record(z.string(), jsonValueSchema).optional(),
	userId: z.string().optional().nullable(),
	notify: z.boolean().optional(),
	source: z.string().optional()
});

export const POST: RequestHandler = async (event) => {
	const logger = createContextLogger('api-events');

	return withAuth(event, async (orgId, projectId, apiKeyId, rateLimitInfo) => {
		try {
			// Parse and validate the request body FIRST (can only be read once)
			const body = await event.request.json();
			const validatedData = createEventSchema.parse(body);

			// Check for idempotency key AFTER parsing body
			const idempotencyKey = event.request.headers.get('Idempotency-Key');

			if (idempotencyKey) {
				// Check if we've already processed this request
				const cacheKey = `idempotency:${orgId}:${idempotencyKey}`;
				const cachedResponse = await redis.get(cacheKey);

				if (cachedResponse) {
					logger.info('Idempotent request replay', {
						idempotencyKey,
						organizationId: orgId,
						channelName: validatedData.channelName
					});

					// Parse cached response - handle both string and object types
					// (Redis client might auto-deserialize depending on configuration)
					const cached =
						typeof cachedResponse === 'string' ? JSON.parse(cachedResponse) : cachedResponse;

					return json(cached.body, {
						status: cached.status,
						headers: {
							'X-RateLimit-Limit': String(rateLimitInfo.limit),
							'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
							'X-RateLimit-Reset': String(rateLimitInfo.reset),
							'X-Idempotent-Replay': 'true'
						}
					});
				}
			}

			// Get or create the channel within the folder
			const channel = await getOrCreateChannel(validatedData.channelName, projectId, orgId, {
				icon: validatedData.icon,
				description: validatedData.description
			});

			// Resolve userId if provided (supports both direct userId and aliases)
			let resolvedUserId = validatedData.userId;
			if (validatedData.userId) {
				const resolved = await resolveUserAlias(orgId, validatedData.userId);
				if (resolved) {
					resolvedUserId = resolved;
					logger.info('Resolved userId from alias', {
						original: validatedData.userId,
						resolved: resolvedUserId
					});
				}
			}

			// Create and broadcast the event
			const createdEvent = await createAndBroadcastEvent({
				channelId: channel.id,
				projectId: projectId,
				organizationId: orgId,
				title: validatedData.title,
				description: validatedData.description,
				icon: validatedData.icon,
				tags: validatedData.tags,
				metadata: validatedData.metadata,
				userId: resolvedUserId,
				notify: validatedData.notify,
				source: validatedData.source ?? 'api'
			});

			const responseBody = {
				success: true,
				data: {
					id: createdEvent.id,
					channelId: channel.id,
					channelName: channel.name,
					title: createdEvent.title,
					createdAt: createdEvent.createdAt.toISOString()
				},
				requestId: event.locals.requestId
			};

			// Cache idempotent response if idempotency key was provided
			if (idempotencyKey) {
				const cacheKey = `idempotency:${orgId}:${idempotencyKey}`;
				const cacheValue = JSON.stringify({
					body: responseBody,
					status: 201
				});

				// Cache for 24 hours - MUST await to prevent race conditions
				try {
					await redis.set(cacheKey, cacheValue, { ex: 86400 });
					logger.info('Cached idempotent response', {
						idempotencyKey,
						organizationId: orgId,
						channelName: validatedData.channelName
					});
				} catch (error) {
					// Log error but don't fail the request if caching fails
					logger.error(
						'Failed to cache idempotent response',
						error instanceof Error ? error : undefined,
						{
							idempotencyKey,
							organizationId: orgId
						}
					);
				}
			}

			return json(responseBody, {
				status: 201,
				headers: {
					'X-RateLimit-Limit': String(rateLimitInfo.limit),
					'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
					'X-RateLimit-Reset': String(rateLimitInfo.reset)
				}
			});
		} catch (error) {
			logger.error('Error creating event via API', error instanceof Error ? error : undefined, {
				organizationId: orgId,
				projectId,
				apiKeyId
			});

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
					error: 'Failed to create event',
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
