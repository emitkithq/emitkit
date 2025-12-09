import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { channel, type Channel } from '$lib/server/db/schema';

export type { Channel, ChannelInsert, ChannelUpdate } from '$lib/server/db/schema';
export type { PaginatedQueryResult, PaginationParams } from '$lib/server/db/utils';

export const selectChannelSchema = createSelectSchema(channel);
export const insertChannelSchema = createInsertSchema(channel);

export type ChannelWithEventCount = Channel & {
	eventCount: number;
};
