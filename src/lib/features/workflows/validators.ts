import { z } from 'zod';

// Trigger configuration schemas
// Note: Fields allow empty strings/arrays during editing, validation happens at execution time
export const triggerConfigSchema = z.union([
	// Uninitialized trigger (no trigger type selected yet)
	z.object({
		triggerType: z.union([z.null(), z.undefined()]).optional()
	}),
	z.object({
		triggerType: z.literal('folder'),
		folderId: z.string().optional(),
		eventTypes: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional()
	}),
	z.object({
		triggerType: z.literal('channel'),
		channelId: z.string().optional(),
		eventTypes: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional()
	}),
	z.object({
		triggerType: z.literal('event_type'),
		eventTypes: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional()
	}),
	z.object({
		triggerType: z.literal('tag'),
		tags: z.array(z.string()).optional()
	})
]);

// Action configuration schemas
// Note: Fields allow empty strings during editing, validation happens at execution time
export const actionConfigSchema = z.union([
	// Uninitialized action (no action type selected yet)
	z.object({
		actionType: z.union([z.null(), z.undefined()]).optional()
	}),
	// Slack - supports both integration reference (new) and webhook URL (legacy)
	z.object({
		actionType: z.literal('slack'),
		integrationId: z.string().optional(), // New: reference to stored integration
		webhookUrl: z.union([z.string().url(), z.literal('')]).optional(), // Legacy: direct webhook
		messageTemplate: z.string().optional()
	}),
	// Discord
	z.object({
		actionType: z.literal('discord'),
		webhookUrl: z.union([z.string().url(), z.literal('')]).optional(),
		messageTemplate: z.string().optional()
	}),
	// Email
	z.object({
		actionType: z.literal('email'),
		to: z.union([z.string().email(), z.literal('')]).optional(),
		subject: z.string().optional(),
		body: z.string().optional()
	}),
	// HTTP
	z.object({
		actionType: z.literal('http'),
		httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
		endpoint: z.union([z.string().url(), z.literal('')]).optional(),
		headers: z.record(z.string(), z.string()).optional(),
		httpBody: z.string().optional()
	}),
	// Condition
	z.object({
		actionType: z.literal('condition'),
		condition: z.string().optional()
	})
]);

// Workflow node schema
export const workflowNodeSchema = z.object({
	id: z.string(),
	type: z.enum(['trigger', 'action']),
	position: z.object({
		x: z.number(),
		y: z.number()
	}),
	data: z.object({
		label: z.string(),
		description: z.string().optional(),
		config: z.union([triggerConfigSchema, actionConfigSchema])
	})
});

// Workflow edge schema
export const workflowEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	condition: z.string().optional()
});

// Create workflow schema
export const createWorkflowSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(500).optional(),
	nodes: z.array(workflowNodeSchema).default([]),
	edges: z.array(workflowEdgeSchema).default([]),
	enabled: z.boolean().default(true)
});

// Update workflow schema
export const updateWorkflowSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(500).optional(),
	nodes: z.array(workflowNodeSchema).optional(),
	edges: z.array(workflowEdgeSchema).optional(),
	enabled: z.boolean().optional()
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
