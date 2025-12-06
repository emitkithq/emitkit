import type { Workflow, WorkflowNodeData, WorkflowEdgeData } from '$lib/server/db/schema/workflow';
import { createWorkflowExecution, updateWorkflowExecution } from './repository';
import { createContextLogger } from '$lib/server/logger';
import { Parser } from 'expr-eval';
import { db } from '$lib/server/db';

const logger = createContextLogger('workflow-execution');

export type ExecutionContext = {
	trigger: {
		eventId: string;
		channelId: string;
		folderId: string;
		eventTitle: string;
		eventDescription?: string;
		eventTags?: string[];
		eventMetadata?: Record<string, unknown>;
	};
	outputs: Record<string, unknown>; // nodeId -> output
};

type NodeExecutionLog = {
	nodeId: string;
	nodeName: string;
	status: 'pending' | 'running' | 'success' | 'error';
	output?: unknown;
	error?: string;
	startedAt: string;
	completedAt?: string;
};

/**
 * Validate workflow configuration before execution
 */
function validateWorkflowConfiguration(nodes: WorkflowNodeData[]): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	for (const node of nodes) {
		if (node.type === 'trigger') {
			const config = node.data.config;
			if (!('triggerType' in config) || !config.triggerType) {
				errors.push(`Trigger node "${node.data.label}" (${node.id}) is missing trigger type`);
			}
		} else if (node.type === 'action') {
			const config = node.data.config;
			if (!('actionType' in config) || !config.actionType) {
				errors.push(`Action node "${node.data.label}" (${node.id}) is not configured - please select an action type`);
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Execute a workflow with the given trigger event
 * Uses database transaction to ensure data integrity
 */
export async function executeWorkflow(
	workflow: Workflow,
	triggerEvent: {
		eventId: string;
		channelId: string;
		folderId: string;
		eventTitle: string;
		eventDescription?: string;
		eventTags?: string[];
		eventMetadata?: Record<string, unknown>;
	}
): Promise<void> {
	const operation = logger.start('Execute workflow', {
		workflowId: workflow.id,
		workflowName: workflow.name,
		eventId: triggerEvent.eventId
	});

	await db.transaction(async (tx) => {
		// Create execution record within transaction
		const execution = await createWorkflowExecution({
			workflowId: workflow.id,
			status: 'running',
			triggeredBy: {
				eventId: triggerEvent.eventId,
				channelId: triggerEvent.channelId,
				folderId: triggerEvent.folderId,
				eventTitle: triggerEvent.eventTitle
			},
			logs: []
		});

		const context: ExecutionContext = {
			trigger: triggerEvent,
			outputs: {}
		};

		const logs: NodeExecutionLog[] = [];

		try {
			operation.step('Building execution graph');
			const nodes = workflow.nodes as unknown as WorkflowNodeData[];
			const edges = workflow.edges as unknown as WorkflowEdgeData[];

			// Validate workflow configuration
			const validation = validateWorkflowConfiguration(nodes);
			if (!validation.valid) {
				throw new Error(`Workflow configuration invalid:\n${validation.errors.join('\n')}`);
			}

			// Find trigger nodes (starting points)
			const triggerNodes = nodes.filter((n) => n.type === 'trigger');

			if (triggerNodes.length === 0) {
				throw new Error('No trigger nodes found in workflow');
			}

			// Execute workflow graph starting from trigger nodes
			for (const triggerNode of triggerNodes) {
				await executeNode(triggerNode, nodes, edges, context, logs);
			}

			// Update execution as success
			await updateWorkflowExecution(execution.id, {
				status: 'success',
				logs,
				completedAt: new Date()
			});

			operation.end({ executionId: execution.id, nodesExecuted: logs.length });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			logger.error('Workflow execution failed', error as Error, {
				workflowId: workflow.id,
				executionId: execution.id
			});

			// Update execution as failed
			await updateWorkflowExecution(execution.id, {
				status: 'error',
				error: errorMessage,
				logs,
				completedAt: new Date()
			});

			operation.error('Workflow execution failed', error as Error);
			throw error; // Re-throw to rollback transaction
		}
	});
}

/**
 * Execute a single node and its downstream nodes
 */
async function executeNode(
	node: WorkflowNodeData,
	allNodes: WorkflowNodeData[],
	allEdges: WorkflowEdgeData[],
	context: ExecutionContext,
	logs: NodeExecutionLog[]
): Promise<void> {
	const startedAt = new Date().toISOString();

	const log: NodeExecutionLog = {
		nodeId: node.id,
		nodeName: node.data.label,
		status: 'running',
		startedAt
	};

	logs.push(log);

	try {
		let output: unknown = null;

		if (node.type === 'trigger') {
			// Trigger nodes don't execute, they just pass through
			output = context.trigger;
		} else if (node.type === 'action') {
			// Execute action node
			output = await executeActionNode(node, context);
		}

		// Store output in context
		context.outputs[node.id] = output;

		// Update log
		log.status = 'success';
		log.output = output;
		log.completedAt = new Date().toISOString();

		// Find downstream nodes connected to this node
		const outgoingEdges = allEdges.filter((e) => e.source === node.id);

		// Execute downstream nodes
		for (const edge of outgoingEdges) {
			const targetNode = allNodes.find((n) => n.id === edge.target);
			if (targetNode) {
				// Check if edge has a condition
				if (edge.condition) {
					const conditionMet = evaluateCondition(edge.condition, context);
					if (!conditionMet) {
						continue; // Skip this branch
					}
				}
				await executeNode(targetNode, allNodes, allEdges, context, logs);
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		log.status = 'error';
		log.error = errorMessage;
		log.completedAt = new Date().toISOString();
		throw error; // Re-throw to fail the workflow
	}
}

/**
 * Execute an action node based on its type
 */
async function executeActionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<unknown> {
	const config = node.data.config;
	const actionType = 'actionType' in config ? config.actionType : null;

	if (!actionType) {
		throw new Error(
			`Action node "${node.data.label}" (${node.id}) is not configured. ` +
			`Please select an action type from the configuration panel.`
		);
	}

	switch (actionType) {
		case 'slack':
			return await executeSlackActionNode(node, context);

		case 'discord':
			return await executeDiscordActionNode(node, context);

		case 'email':
			return await executeEmailActionNode(node, context);

		case 'http':
			return await executeHttpActionNode(node, context);

		case 'condition':
			return await executeConditionNode(node, context);

		default:
			throw new Error(`Unknown action type: ${actionType}`);
	}
}

/**
 * Execute Slack action
 */
export async function executeSlackActionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<{ sent: boolean }> {
	const config = node.data.config;
	const integrationId = 'integrationId' in config ? config.integrationId : null;
	const webhookUrl = 'webhookUrl' in config ? config.webhookUrl : null;

	const messageTemplate = 'messageTemplate' in config ? config.messageTemplate : '';
	const message = interpolateTemplate(messageTemplate as string, context);

	// New flow: Use stored integration
	if (integrationId) {
		const { getIntegrationById } = await import('$lib/features/integrations/server/repository');
		const integration = await getIntegrationById(integrationId as string);

		if (!integration) {
			throw new Error(`Slack integration not found: ${integrationId}`);
		}

		if (!integration.enabled) {
			throw new Error(`Slack integration is disabled: ${integrationId}`);
		}

		const botToken = integration.config.botToken as string | undefined;
		const slackChannelId = integration.config.slackChannelId as string | undefined;

		if (!botToken || !slackChannelId) {
			throw new Error('Slack integration missing bot token or channel ID');
		}

		// Use Slack API to post message
		const { postMessage } = await import('$lib/features/integrations/server/slack-api');
		const result = await postMessage(botToken, slackChannelId, {
			text: message,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: message
					}
				}
			]
		});

		if (!result.success) {
			throw new Error(`Slack API error: ${result.error}`);
		}

		return { sent: true };
	}

	// Legacy flow: Use webhook URL
	if (webhookUrl) {
		logger.warn('Using deprecated webhook flow in workflow execution', {
			nodeId: node.id
		});

		const response = await fetch(webhookUrl as string, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: message,
				blocks: [
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: message
						}
					}
				]
			}),
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			throw new Error(`Slack webhook failed: ${response.status}`);
		}

		return { sent: true };
	}

	throw new Error('Slack action not configured - missing integration or webhook URL');
}

/**
 * Execute Discord action
 */
export async function executeDiscordActionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<{ sent: boolean }> {
	const config = node.data.config;
	if (!('webhookUrl' in config) || !config.webhookUrl) {
		throw new Error('Discord webhook URL not configured');
	}

	const messageTemplate = 'messageTemplate' in config ? config.messageTemplate : '';
	const message = interpolateTemplate(messageTemplate as string, context);

	// Send to Discord webhook
	const webhookUrl = config.webhookUrl as string;
	const response = await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content: message,
			embeds: [
				{
					description: message,
					color: 0x5865f2
				}
			]
		}),
		signal: AbortSignal.timeout(10000)
	});

	if (!response.ok) {
		throw new Error(`Discord webhook failed: ${response.status}`);
	}

	return { sent: true };
}

/**
 * Execute Email action (placeholder)
 */
export async function executeEmailActionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<{ sent: boolean }> {
	const config = node.data.config;
	logger.info('Email action executed', { nodeId: node.id, config });
	// TODO: Implement email sending
	return { sent: false };
}

/**
 * Check if a URL points to an internal/private resource (SSRF protection)
 */
function isInternalUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		const hostname = url.hostname.toLowerCase();

		// Block localhost
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
			return true;
		}

		// Block private IP ranges
		const privateRanges = [
			/^10\./, // 10.0.0.0/8
			/^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
			/^192\.168\./, // 192.168.0.0/16
			/^169\.254\./, // 169.254.0.0/16 (link-local)
			/^127\./ // 127.0.0.0/8 (loopback)
		];

		if (privateRanges.some((range) => range.test(hostname))) {
			return true;
		}

		// Block cloud metadata endpoints
		if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
			return true;
		}

		return false;
	} catch {
		return true; // Block malformed URLs
	}
}

/**
 * Execute HTTP request action with SSRF protection
 */
export async function executeHttpActionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<unknown> {
	const config = node.data.config;
	if (!('endpoint' in config) || !config.endpoint) {
		throw new Error('HTTP endpoint not configured');
	}

	const method = ('httpMethod' in config ? config.httpMethod : 'POST') as string;
	const endpoint = interpolateTemplate(config.endpoint as string, context);

	// SSRF Protection: Validate URL before making request
	if (isInternalUrl(endpoint)) {
		logger.error('SSRF attempt blocked', { endpoint, nodeId: node.id });
		throw new Error('Internal URLs are not allowed for security reasons');
	}

	const headers = ('headers' in config ? config.headers : {}) as Record<string, string>;
	const body = 'httpBody' in config ? config.httpBody : null;

	const response = await fetch(endpoint, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...headers
		},
		...(body && method !== 'GET' && { body: interpolateTemplate(body as string, context) }),
		signal: AbortSignal.timeout(10000)
	});

	if (!response.ok) {
		throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Execute condition node
 */
export async function executeConditionNode(
	node: WorkflowNodeData,
	context: ExecutionContext
): Promise<{ result: boolean }> {
	const config = node.data.config;
	if (!('condition' in config) || !config.condition) {
		throw new Error('Condition not configured');
	}

	const result = evaluateCondition(config.condition as string, context);
	return { result };
}

/**
 * Interpolate template variables with context data
 * Supports {{trigger.eventTitle}}, {{trigger.eventDescription}}, etc.
 */
export function interpolateTemplate(template: string, context: ExecutionContext): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
		const keys = path.trim().split('.');
		let value: any = context;

		for (const key of keys) {
			if (value && typeof value === 'object' && key in value) {
				value = value[key];
			} else {
				return match; // Return original if path not found
			}
		}

		return String(value ?? '');
	});
}

/**
 * Convert unknown values to expr-eval compatible Value type
 */
function toExprValue(value: unknown): number | string {
	if (typeof value === 'number' || typeof value === 'string') {
		return value;
	}
	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}
	if (value === null || value === undefined) {
		return '';
	}
	// Arrays and objects get stringified
	if (Array.isArray(value)) {
		return JSON.stringify(value);
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

/**
 * Flatten nested objects for expr-eval (converts { a: { b: 1 } } to { 'a.b': 1 })
 */
function flattenForEval(obj: Record<string, unknown>, prefix = ''): Record<string, number | string> {
	const flattened: Record<string, number | string> = {};
	for (const [key, value] of Object.entries(obj)) {
		const newKey = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(flattened, flattenForEval(value as Record<string, unknown>, newKey));
		} else {
			flattened[newKey] = toExprValue(value);
		}
	}
	return flattened;
}

/**
 * Evaluate a condition expression safely using expr-eval
 */
export function evaluateCondition(condition: string, context: ExecutionContext): boolean {
	try {
		// Use expr-eval for safe expression evaluation
		const parser = new Parser();
		const expr = parser.parse(condition);

		// Flatten context for expr-eval compatibility
		const flatContext: Record<string, number | string> = {
			...flattenForEval({ trigger: context.trigger }),
			...flattenForEval({ outputs: context.outputs })
		};

		return Boolean(expr.evaluate(flatContext));
	} catch (error) {
		logger.warn('Condition evaluation failed', { condition, error });
		return false;
	}
}
