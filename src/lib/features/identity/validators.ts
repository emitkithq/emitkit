import { z } from 'zod';

export const identifyUserSchema = z.object({
	user_id: z.string().min(1, 'User ID is required'),
	properties: z.record(z.string(), z.unknown()).optional().default({}),
	aliases: z.array(z.string()).optional()
});

export type IdentifyUserInput = z.infer<typeof identifyUserSchema>;

export const createAliasSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	alias: z.string().min(1, 'Alias is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type CreateAliasInput = z.infer<typeof createAliasSchema>;

export const deleteAliasSchema = z.object({
	alias: z.string().min(1, 'Alias is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type DeleteAliasInput = z.infer<typeof deleteAliasSchema>;

export const resolveUserIdSchema = z.object({
	userIdOrAlias: z.string().min(1, 'User ID or alias is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type ResolveUserIdInput = z.infer<typeof resolveUserIdSchema>;
