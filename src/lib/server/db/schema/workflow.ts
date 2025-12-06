import { relations } from 'drizzle-orm';
import { pgTable, index, json, boolean } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';

export const workflow = pgTable(
	'workflow',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('workflow'))
			.notNull()
			.primaryKey(),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),

		name: t.text('name').notNull(),
		description: t.text('description'),

		// Workflow graph stored as JSON (nodes + edges)
		nodes: t
			.json('nodes')
			.$type<WorkflowNodeData[]>()
			.notNull()
			.default([]),
		edges: t
			.json('edges')
			.$type<WorkflowEdgeData[]>()
			.notNull()
			.default([]),

		enabled: t.boolean('enabled').default(true).notNull(),

		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		updatedAt: t.timestamp('updated_at').notNull().defaultNow()
	}),
	(table) => ({
		idxOrgEnabled: index('idx_workflows_org_enabled').on(
			table.organizationId,
			table.enabled
		)
	})
);

export const workflowExecution = pgTable(
	'workflow_execution',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('wf_exec'))
			.notNull()
			.primaryKey(),
		workflowId: t
			.text('workflow_id')
			.notNull()
			.references(() => workflow.id, { onDelete: 'cascade' }),

		status: t.text('status', { enum: ['pending', 'running', 'success', 'error'] }).notNull(),

		// Event that triggered this execution
		triggeredBy: t
			.json('triggered_by')
			.$type<{
				eventId: string;
				channelId: string;
				folderId: string;
				eventTitle: string;
			}>()
			.notNull(),

		// Execution logs per node
		logs: t
			.json('logs')
			.$type<
				Array<{
					nodeId: string;
					nodeName: string;
					status: 'pending' | 'running' | 'success' | 'error';
					output?: unknown;
					error?: string;
					startedAt: string;
					completedAt?: string;
				}>
			>()
			.default([])
			.notNull(),

		error: t.text('error'),

		startedAt: t.timestamp('started_at').notNull().defaultNow(),
		completedAt: t.timestamp('completed_at')
	}),
	(table) => ({
		idxWorkflowStatus: index('idx_workflow_executions_workflow_status').on(
			table.workflowId,
			table.status
		)
	})
);

export const workflowRelations = relations(workflow, ({ one, many }) => ({
	organization: one(organization, {
		fields: [workflow.organizationId],
		references: [organization.id]
	}),
	executions: many(workflowExecution)
}));

export const workflowExecutionRelations = relations(workflowExecution, ({ one }) => ({
	workflow: one(workflow, {
		fields: [workflowExecution.workflowId],
		references: [workflow.id]
	})
}));

// Type definitions for workflow nodes and edges
export type WorkflowNodeType = 'trigger' | 'action';

export type TriggerType = 'folder' | 'channel' | 'event_type' | 'tag';

export type ActionType = 'slack' | 'discord' | 'email' | 'http' | 'condition';

export type TriggerConfig = {
	triggerType?: TriggerType | null;
	folderId?: string;
	channelId?: string;
	eventTypes?: string[];
	tags?: string[];
};

export type ActionConfig = {
	actionType?: ActionType | null;
	// Slack/Discord
	webhookUrl?: string;
	messageTemplate?: string;
	// Email
	to?: string;
	subject?: string;
	body?: string;
	// HTTP
	httpMethod?: string;
	endpoint?: string;
	headers?: Record<string, string>;
	httpBody?: string;
	// Condition
	condition?: string;
};

export type WorkflowNodeData = {
	id: string;
	type: WorkflowNodeType;
	position: { x: number; y: number };
	data: {
		label: string;
		description?: string;
		config: TriggerConfig | ActionConfig;
	};
};

export type WorkflowEdgeData = {
	id: string;
	source: string;
	target: string;
	// Optional: For conditional edges
	condition?: string;
};

export type Workflow = typeof workflow.$inferSelect;
export type WorkflowInsert = typeof workflow.$inferInsert;
export type WorkflowExecution = typeof workflowExecution.$inferSelect;
export type WorkflowExecutionInsert = typeof workflowExecution.$inferInsert;
