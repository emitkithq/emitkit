import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAndBroadcastEvent } from '$lib/features/events/server';
import { getOrCreateChannel } from '$lib/features/channels/server/repository';
import { withAuth } from '$lib/features/api/server/middleware';
import { z } from 'zod';
import { createContextLogger } from '$lib/server/logger';
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
	channelName: z.string(),
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
			const body = await event.request.json();
			const validatedData = createEventSchema.parse(body);

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
