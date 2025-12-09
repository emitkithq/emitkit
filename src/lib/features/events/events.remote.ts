import { z } from 'zod';
import { query, command } from '$app/server';
import { paginationParamsSchema } from '$lib/server/db/utils';
import { listEvents, deleteEvent } from '$lib/features/events/server';

const listEventsSchema = paginationParamsSchema.extend({
	channelId: z.string(),
	organizationId: z.string()
});

export const getEventsListQuery = query(listEventsSchema, async (input) => {
	// Now queries Tinybird instead of PostgreSQL
	return await listEvents(input.channelId, input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

export type ListEvents = z.infer<typeof listEventsSchema>;

const deleteEventSchema = z.object({
	eventId: z.string(),
	channelId: z.string(),
	organizationId: z.string()
});

export const deleteEventCommand = command(deleteEventSchema, async (input) => {
	await deleteEvent(input.eventId, input.channelId, input.organizationId);
	return { success: true };
});
