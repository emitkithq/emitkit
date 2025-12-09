import { z } from 'zod';

export const createEventSchema = z.object({
	channelId: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required'),
	title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
	description: z
		.string()
		.max(5000, 'Description must be 5000 characters or less')
		.optional()
		.nullable(),
	icon: z.string().max(50, 'Icon must be 50 characters or less').optional().nullable(),
	tags: z.array(z.string()).optional().default([]),
	metadata: z.record(z.string(), z.unknown()).optional().default({}),
	userId: z.string().max(255, 'User ID must be 255 characters or less').optional().nullable(),
	notify: z.boolean().optional().default(true),
	source: z.enum(['api', 'webhook', 'command']).optional().default('api')
});

export const publicEventInputSchema = z.object({
	channel: z.string().min(1, 'Channel is required'),
	event: z.string().min(1, 'Event title is required').max(500),
	description: z.string().max(5000).optional(),
	icon: z.string().max(50).optional(),
	tags: z.array(z.string()).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	user_id: z.string().max(255).optional(),
	notify: z.boolean().optional().default(true)
});

export const eventIdSchema = z.object({
	id: z.string().min(1, 'Event ID is required')
});

export const listEventsParamsSchema = z.object({
	channelId: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required'),
	page: z.number().int().min(1).optional().default(1),
	limit: z.number().int().min(1).max(100).optional().default(20)
});

export const streamEventsParamsSchema = z.object({
	channelId: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required'),
	afterTimestamp: z.coerce.date().optional(),
	limit: z.number().int().min(1).max(100).optional().default(100)
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type PublicEventInput = z.infer<typeof publicEventInputSchema>;
export type EventIdParams = z.infer<typeof eventIdSchema>;
export type ListEventsParams = z.infer<typeof listEventsParamsSchema>;
export type StreamEventsParams = z.infer<typeof streamEventsParamsSchema>;
