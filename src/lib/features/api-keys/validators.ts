import { z } from 'zod';

// Schema for our remote function
export const createApiKeySchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
	projectId: z.string().min(1, 'Project ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// Schema for Better Auth API key creation (used in middleware)
export const betterAuthApiKeySchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
	userId: z.string().min(1, 'User ID is required'),
	metadata: z.object({
		projectId: z.string().min(1, 'Project ID is required'),
		orgId: z.string().min(1, 'Organization ID is required'),
		projectName: z.string().optional()
	})
	// rateLimitEnabled: z.boolean().optional()
});

export type BetterAuthApiKeyInput = z.infer<typeof betterAuthApiKeySchema>;
