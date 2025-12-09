import { z } from 'zod';

export const projectCreateSchema = z.object({
	organizationId: z.string().min(1, 'Organization ID is required'),
	name: z.string().min(1, 'Folder name is required').max(255, 'Folder name is too long'),
	slug: z
		.string()
		.min(1, 'Slug is required')
		.max(255, 'Slug is too long')
		.regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
	url: z.string().url('Invalid URL format').max(500, 'URL is too long').optional(),
	description: z.string().optional()
});

export const projectUpdateSchema = z.object({
	name: z.string().min(1, 'Folder name is required').max(255, 'Folder name is too long').optional(),
	slug: z
		.string()
		.min(1, 'Slug is required')
		.max(255, 'Slug is too long')
		.regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
		.optional(),
	url: z.string().url('Invalid URL format').max(500, 'URL is too long').optional(),
	description: z.string().optional()
});

export const projectListParamsSchema = z.object({
	organizationId: z.string().min(1, 'Organization ID is required'),
	page: z.number().int().min(1).default(1).optional(),
	limit: z.number().int().min(1).max(100).default(20).optional()
});

export const projectIdSchema = z.object({
	projectId: z.string().min(1, 'Folder ID is required')
});

// -----------------------------------------------------------------------------
// Type Exports
// -----------------------------------------------------------------------------

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectListParams = z.infer<typeof projectListParamsSchema>;
export type ProjectIdParam = z.infer<typeof projectIdSchema>;
