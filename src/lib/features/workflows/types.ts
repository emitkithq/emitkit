import type {
	Workflow,
	WorkflowInsert,
	WorkflowExecution,
	WorkflowExecutionInsert,
	WorkflowNodeData,
	WorkflowEdgeData,
	TriggerConfig,
	ActionConfig,
	TriggerType,
	ActionType
} from '$lib/server/db/schema/workflow';

// Re-export database types
export type {
	Workflow,
	WorkflowInsert,
	WorkflowExecution,
	WorkflowExecutionInsert,
	WorkflowNodeData,
	WorkflowEdgeData,
	TriggerConfig,
	ActionConfig,
	TriggerType,
	ActionType
};

// Client-side workflow node type (compatible with Svelte Flow / XYFlow)
export type WorkflowNode = {
	id: string;
	type: 'trigger' | 'action' | 'add';
	position: { x: number; y: number };
	data: {
		label: string;
		description?: string;
		config: TriggerConfig | ActionConfig;
		status?: 'idle' | 'running' | 'success' | 'error';
		enabled?: boolean;
	};
	selected?: boolean;
};

// Client-side workflow edge type (compatible with Svelte Flow / XYFlow)
export type WorkflowEdge = {
	id: string;
	source: string;
	target: string;
	type?: 'default' | 'animated' | 'straight';
	condition?: string;
	selected?: boolean;
};

// Workflow with full details
export type WorkflowDetail = Workflow & {
	executionCount?: number;
	lastExecutedAt?: Date | null;
};

// List view type
export type WorkflowListItem = {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
	executionCount?: number;
	lastExecutedAt?: Date | null;
};
