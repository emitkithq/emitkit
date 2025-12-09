import { z } from 'zod';
import { paginationParamsSchema } from '$lib/server/db/utils';

export const insertChannelSchema = z.object({
	organizationId: z.string().min(1, 'Organization ID is required'),
	name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
	icon: z.string().max(50).optional(),
	description: z.string().optional(),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional()
});

export const updateChannelSchema = z
	.object({
		name: z.string().min(1).max(255).optional(),
		icon: z.string().max(50).optional(),
		description: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listChannelsSchema = paginationParamsSchema.extend({
	organizationId: z.string().min(1, 'Organization ID is required')
});

export const getChannelSchema = z.object({
	id: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export const deleteChannelSchema = z.object({
	id: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type InsertChannelInput = z.infer<typeof insertChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type ListChannelsInput = z.infer<typeof listChannelsSchema>;
export type GetChannelInput = z.infer<typeof getChannelSchema>;
export type DeleteChannelInput = z.infer<typeof deleteChannelSchema>;
