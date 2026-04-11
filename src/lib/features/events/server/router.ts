import { z } from 'zod';
import { base, middleware } from '$lib/server/rpc';
import { paginationParamsSchema } from '$lib/server/db/utils';
import {
	listEvents,
	deleteEvent,
	listEventsByOrg,
	getEventsAfter
} from '$lib/features/events/server';
import { getChannelByIdAndOrg } from '$lib/features/channels/server/repository';
import { ORPCError } from '@orpc/server';
import { createContextLogger } from '$lib/server/logger';

const authed = base.use(middleware.auth);

const list = authed
	.input(
		paginationParamsSchema.extend({
			channelId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		return await listEvents(input.channelId, input.organizationId, {
			page: input.page,
			limit: input.limit
		});
	});

const listByOrg = authed
	.input(
		paginationParamsSchema.extend({
			organizationId: z.string(),
			projectId: z.string().optional()
		})
	)
	.handler(async ({ input }) => {
		return await listEventsByOrg(
			input.organizationId,
			{
				page: input.page,
				limit: input.limit
			},
			input.projectId
		);
	});

const remove = authed
	.input(
		z.object({
			eventId: z.string(),
			channelId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		await deleteEvent(input.eventId, input.channelId, input.organizationId);
		return { success: true };
	});

const POLL_INTERVAL_MS = 5000;

const streamByOrg = authed
	.input(
		z.object({
			organizationId: z.string(),
			projectId: z.string().optional()
		})
	)
	.handler(async function* ({ input, signal }) {
		const logger = createContextLogger('org-event-stream');
		let lastCheck = new Date();

		yield { type: 'connected' as const };

		while (!signal?.aborted) {
			try {
				const result = await listEventsByOrg(
					input.organizationId,
					{ page: 1, limit: 100 },
					input.projectId
				);

				const events = result.items.filter(
					(event) => event.createdAt.getTime() > lastCheck.getTime()
				);

				for (const event of events) {
					if (signal?.aborted) break;
					yield {
						type: 'event' as const,
						data: {
							id: event.id,
							channelId: event.channelId,
							projectId: event.projectId,
							organizationId: event.organizationId,
							title: event.title,
							description: event.description,
							icon: event.icon,
							tags: event.tags,
							metadata: event.metadata,
							userId: event.userId,
							notify: event.notify,
							source: event.source,
							createdAt: event.createdAt.toISOString()
						}
					};
				}

				lastCheck = new Date();

				yield { type: 'heartbeat' as const };

				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			} catch (error) {
				logger.error('Error polling org events', error instanceof Error ? error : undefined, {
					organizationId: input.organizationId
				});
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			}
		}
	});

const streamByChannel = authed
	.input(
		z.object({
			channelId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async function* ({ input, signal }) {
		const logger = createContextLogger('channel-event-stream');

		const channel = await getChannelByIdAndOrg(input.channelId, input.organizationId);
		if (!channel) {
			throw new ORPCError('NOT_FOUND', { message: 'Channel not found' });
		}

		let lastCheck = new Date();

		yield { type: 'connected' as const };

		while (!signal?.aborted) {
			try {
				const events = await getEventsAfter(input.channelId, lastCheck, input.organizationId, 100);

				for (const event of events) {
					if (signal?.aborted) break;
					yield {
						type: 'event' as const,
						data: {
							id: event.id,
							channelId: event.channelId,
							projectId: event.projectId,
							organizationId: event.organizationId,
							title: event.title,
							description: event.description,
							icon: event.icon,
							tags: event.tags,
							metadata: event.metadata,
							userId: event.userId,
							notify: event.notify,
							source: event.source,
							createdAt: event.createdAt.toISOString()
						}
					};
				}

				lastCheck = new Date();

				yield { type: 'heartbeat' as const };

				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			} catch (error) {
				logger.error('Error polling events', error instanceof Error ? error : undefined, {
					channelId: input.channelId,
					organizationId: input.organizationId
				});
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			}
		}
	});

export const eventsRouter = {
	list,
	listByOrg,
	delete: remove,
	streamByOrg,
	streamByChannel
};
