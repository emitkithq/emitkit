import { z } from 'zod';

// =============================================================================
// Funnel Schemas
// =============================================================================

export const funnelInsertSchema = z.object({
	organizationId: z.string().min(1),
	name: z.string().min(1).max(255),
	description: z.string().optional().nullable(),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional()
});

export const funnelUpdateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().optional().nullable()
});

export const createFunnelSchema = z.object({
	organizationId: z.string().min(1),
	name: z.string().min(1).max(255),
	description: z.string().optional().nullable(),
	steps: z
		.array(
			z.object({
				eventKey: z.string().min(1).max(255),
				name: z.string().min(1).max(255)
			})
		)
		.optional()
});

// =============================================================================
// Funnel Step Schemas
// =============================================================================

export const funnelStepInsertSchema = z.object({
	funnelId: z.string().min(1),
	organizationId: z.string().min(1),
	eventKey: z.string().min(1).max(255),
	stepOrder: z.number().int().min(1),
	name: z.string().min(1).max(255),
	createdAt: z.date().optional()
});

// =============================================================================
// Funnel Progress Schemas
// =============================================================================

export const funnelProgressInsertSchema = z.object({
	funnelId: z.string().min(1),
	organizationId: z.string().min(1),
	userId: z.string().min(1).max(255),
	currentStep: z.number().int().min(0).optional().default(0),
	completed: z.boolean().optional().default(false),
	startedAt: z.date().optional(),
	completedAt: z.date().optional().nullable(),
	updatedAt: z.date().optional()
});

export const advanceStepSchema = z.object({
	progressId: z.string().min(1),
	stepOrder: z.number().int().min(1)
});

// =============================================================================
// Type Exports
// =============================================================================

export type FunnelInsertInput = z.infer<typeof funnelInsertSchema>;
export type FunnelUpdateInput = z.infer<typeof funnelUpdateSchema>;
export type CreateFunnelInput = z.infer<typeof createFunnelSchema>;
export type FunnelStepInsertInput = z.infer<typeof funnelStepInsertSchema>;
export type FunnelProgressInsertInput = z.infer<typeof funnelProgressInsertSchema>;
export type AdvanceStepInput = z.infer<typeof advanceStepSchema>;
