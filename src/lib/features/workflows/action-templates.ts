import { getFaviconUrl } from '$lib/utils/url';
import type { ActionConfig, TriggerConfig } from './types';

export type ActionCategory = 'communication' | 'data' | 'logic' | 'integration';

export type ActionTemplate = {
	id: string;
	type: 'action';
	category: ActionCategory;
	name: string;
	description: string;
	iconUrl: string | null;
	serviceUrl?: string;
	config: ActionConfig;
	requiredFields?: string[];
};

export type TriggerTemplate = {
	id: string;
	type: 'trigger';
	category: ActionCategory;
	name: string;
	description: string;
	iconUrl: string | null;
	serviceUrl?: string;
	config: TriggerConfig;
	requiredFields?: string[];
};

export type Template = ActionTemplate | TriggerTemplate;

export const actionTemplates: ActionTemplate[] = [
	// Communication Actions
	{
		id: 'slack-message',
		type: 'action',
		category: 'communication',
		name: 'Send to Slack',
		description: 'Post a message to a Slack channel using a stored integration',
		serviceUrl: 'https://slack.com',
		iconUrl: getFaviconUrl('https://slack.com', 32),
		config: {
			actionType: 'slack',
			integrationId: '', // User selects from stored integrations
			messageTemplate: '{{trigger.eventTitle}}\n\n{{trigger.eventDescription}}'
		},
		requiredFields: ['integrationId', 'messageTemplate']
	},
	{
		id: 'discord-message',
		type: 'action',
		category: 'communication',
		name: 'Send to Discord',
		description: 'Post a message to a Discord channel',
		serviceUrl: 'https://discord.com',
		iconUrl: getFaviconUrl('https://discord.com', 32),
		config: {
			actionType: 'discord',
			webhookUrl: '',
			messageTemplate: '**{{event.title}}**\n\n{{event.description}}'
		},
		requiredFields: ['webhookUrl', 'messageTemplate']
	},
	{
		id: 'email-send',
		type: 'action',
		category: 'communication',
		name: 'Send Email',
		description: 'Send an email notification',
		serviceUrl: 'https://gmail.com',
		iconUrl: getFaviconUrl('https://gmail.com', 32),
		config: {
			actionType: 'email',
			to: '',
			subject: 'Event: {{event.title}}',
			body: '{{event.description}}'
		},
		requiredFields: ['to', 'subject', 'body']
	},

	// Data Actions
	{
		id: 'http-post',
		type: 'action',
		category: 'data',
		name: 'HTTP POST Request',
		description: 'Send HTTP POST request to a webhook',
		serviceUrl: 'https://httpbin.org',
		iconUrl: getFaviconUrl('https://httpbin.org', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: '',
			headers: {
				'Content-Type': 'application/json'
			},
			httpBody: JSON.stringify({ event: '{{event}}' }, null, 2)
		},
		requiredFields: ['endpoint']
	},
	{
		id: 'http-get',
		type: 'action',
		category: 'data',
		name: 'HTTP GET Request',
		description: 'Fetch data from an API endpoint',
		serviceUrl: 'https://httpbin.org',
		iconUrl: getFaviconUrl('https://httpbin.org', 32),
		config: {
			actionType: 'http',
			httpMethod: 'GET',
			endpoint: '',
			headers: {},
			httpBody: ''
		},
		requiredFields: ['endpoint']
	},
	{
		id: 'http-put',
		type: 'action',
		category: 'data',
		name: 'HTTP PUT Request',
		description: 'Update data via HTTP PUT request',
		serviceUrl: 'https://httpbin.org',
		iconUrl: getFaviconUrl('https://httpbin.org', 32),
		config: {
			actionType: 'http',
			httpMethod: 'PUT',
			endpoint: '',
			headers: {
				'Content-Type': 'application/json'
			},
			httpBody: JSON.stringify({ event: '{{event}}' }, null, 2)
		},
		requiredFields: ['endpoint']
	},
	{
		id: 'http-delete',
		type: 'action',
		category: 'data',
		name: 'HTTP DELETE Request',
		description: 'Delete data via HTTP DELETE request',
		serviceUrl: 'https://httpbin.org',
		iconUrl: getFaviconUrl('https://httpbin.org', 32),
		config: {
			actionType: 'http',
			httpMethod: 'DELETE',
			endpoint: '',
			headers: {},
			httpBody: ''
		},
		requiredFields: ['endpoint']
	},

	// Logic Actions
	{
		id: 'condition-check',
		type: 'action',
		category: 'logic',
		name: 'Condition',
		description: 'Branch workflow based on a condition',
		iconUrl: null,
		config: {
			actionType: 'condition',
			condition: '{{event.priority}} === "high"'
		},
		requiredFields: ['condition']
	},

	// Integration Actions
	{
		id: 'github-issue',
		type: 'action',
		category: 'integration',
		name: 'Create GitHub Issue',
		description: 'Create an issue in a GitHub repository',
		serviceUrl: 'https://github.com',
		iconUrl: getFaviconUrl('https://github.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://api.github.com/repos/{{owner}}/{{repo}}/issues',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer {{github_token}}'
			},
			httpBody: JSON.stringify(
				{
					title: '{{event.title}}',
					body: '{{event.description}}'
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint', 'headers']
	},
	{
		id: 'linear-issue',
		type: 'action',
		category: 'integration',
		name: 'Create Linear Issue',
		description: 'Create an issue in Linear',
		serviceUrl: 'https://linear.app',
		iconUrl: getFaviconUrl('https://linear.app', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://api.linear.app/graphql',
			headers: {
				'Content-Type': 'application/json',
				Authorization: '{{linear_api_key}}'
			},
			httpBody: JSON.stringify(
				{
					query: `mutation IssueCreate {
  issueCreate(
    input: {
      title: "{{event.title}}"
      description: "{{event.description}}"
      teamId: "{{team_id}}"
    }
  ) {
    success
    issue {
      id
      title
    }
  }
}`
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint', 'headers']
	},
	{
		id: 'notion-page',
		type: 'action',
		category: 'integration',
		name: 'Create Notion Page',
		description: 'Create a new page in Notion',
		serviceUrl: 'https://notion.so',
		iconUrl: getFaviconUrl('https://notion.so', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://api.notion.com/v1/pages',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer {{notion_token}}',
				'Notion-Version': '2022-06-28'
			},
			httpBody: JSON.stringify(
				{
					parent: { database_id: '{{database_id}}' },
					properties: {
						Name: {
							title: [
								{
									text: {
										content: '{{event.title}}'
									}
								}
							]
						}
					}
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint', 'headers']
	},
	{
		id: 'airtable-record',
		type: 'action',
		category: 'integration',
		name: 'Create Airtable Record',
		description: 'Add a record to an Airtable base',
		serviceUrl: 'https://airtable.com',
		iconUrl: getFaviconUrl('https://airtable.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://api.airtable.com/v0/{{base_id}}/{{table_name}}',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer {{airtable_api_key}}'
			},
			httpBody: JSON.stringify(
				{
					fields: {
						Title: '{{event.title}}',
						Description: '{{event.description}}'
					}
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint', 'headers']
	},
	{
		id: 'trello-card',
		type: 'action',
		category: 'integration',
		name: 'Create Trello Card',
		description: 'Create a card in Trello',
		serviceUrl: 'https://trello.com',
		iconUrl: getFaviconUrl('https://trello.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://api.trello.com/1/cards',
			headers: {
				'Content-Type': 'application/json'
			},
			httpBody: JSON.stringify(
				{
					idList: '{{list_id}}',
					name: '{{event.title}}',
					desc: '{{event.description}}',
					key: '{{trello_api_key}}',
					token: '{{trello_token}}'
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint']
	},
	{
		id: 'asana-task',
		type: 'action',
		category: 'integration',
		name: 'Create Asana Task',
		description: 'Create a task in Asana',
		serviceUrl: 'https://asana.com',
		iconUrl: getFaviconUrl('https://asana.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://app.asana.com/api/1.0/tasks',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer {{asana_token}}'
			},
			httpBody: JSON.stringify(
				{
					data: {
						name: '{{event.title}}',
						notes: '{{event.description}}',
						projects: ['{{project_id}}']
					}
				},
				null,
				2
			)
		},
		requiredFields: ['endpoint', 'headers']
	},
	{
		id: 'zapier-webhook',
		type: 'action',
		category: 'integration',
		name: 'Send to Zapier',
		description: 'Trigger a Zapier workflow',
		serviceUrl: 'https://zapier.com',
		iconUrl: getFaviconUrl('https://zapier.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://hooks.zapier.com/hooks/catch/{{zap_id}}',
			headers: {
				'Content-Type': 'application/json'
			},
			httpBody: JSON.stringify({ event: '{{event}}' }, null, 2)
		},
		requiredFields: ['endpoint']
	},
	{
		id: 'make-webhook',
		type: 'action',
		category: 'integration',
		name: 'Send to Make (Integromat)',
		description: 'Trigger a Make.com scenario',
		serviceUrl: 'https://make.com',
		iconUrl: getFaviconUrl('https://make.com', 32),
		config: {
			actionType: 'http',
			httpMethod: 'POST',
			endpoint: 'https://hook.{{region}}.make.com/{{webhook_id}}',
			headers: {
				'Content-Type': 'application/json'
			},
			httpBody: JSON.stringify({ event: '{{event}}' }, null, 2)
		},
		requiredFields: ['endpoint']
	}
];

export const triggerTemplates: TriggerTemplate[] = [
	{
		id: 'folder-event',
		type: 'trigger',
		category: 'data',
		name: 'Folder Event',
		description: 'Trigger when an event occurs in a folder',
		iconUrl: null,
		config: {
			triggerType: 'folder',
			folderId: ''
		},
		requiredFields: ['folderId']
	},
	{
		id: 'channel-event',
		type: 'trigger',
		category: 'communication',
		name: 'Channel Event',
		description: 'Trigger when an event occurs in a channel',
		iconUrl: null,
		config: {
			triggerType: 'channel',
			channelId: ''
		},
		requiredFields: ['channelId']
	},
	{
		id: 'event-type-match',
		type: 'trigger',
		category: 'data',
		name: 'Event Type',
		description: 'Trigger on specific event types',
		iconUrl: null,
		config: {
			triggerType: 'event_type',
			eventTypes: []
		},
		requiredFields: ['eventTypes']
	},
	{
		id: 'tag-match',
		type: 'trigger',
		category: 'data',
		name: 'Tag Match',
		description: 'Trigger on events with specific tags',
		iconUrl: null,
		config: {
			triggerType: 'tag',
			tags: []
		},
		requiredFields: ['tags']
	}
];

// Group by category for easy filtering
export const actionsByCategory: Record<ActionCategory, ActionTemplate[]> = {
	communication: actionTemplates.filter((a) => a.category === 'communication'),
	data: actionTemplates.filter((a) => a.category === 'data'),
	logic: actionTemplates.filter((a) => a.category === 'logic'),
	integration: actionTemplates.filter((a) => a.category === 'integration')
};

export const triggersByCategory: Record<ActionCategory, TriggerTemplate[]> = {
	communication: triggerTemplates.filter((t) => t.category === 'communication'),
	data: triggerTemplates.filter((t) => t.category === 'data'),
	logic: triggerTemplates.filter((t) => t.category === 'logic'),
	integration: triggerTemplates.filter((t) => t.category === 'integration')
};

// Category metadata
export const categoryMetadata: Record<
	ActionCategory,
	{ label: string; description: string; color: string }
> = {
	communication: {
		label: 'Communication',
		description: 'Send messages and notifications',
		color: 'blue'
	},
	data: {
		label: 'Data',
		description: 'Fetch and manipulate data',
		color: 'green'
	},
	logic: {
		label: 'Logic',
		description: 'Control flow and conditions',
		color: 'purple'
	},
	integration: {
		label: 'Integrations',
		description: 'Connect to external services',
		color: 'orange'
	}
};

// Helper functions
export function getTemplateById(id: string): Template | undefined {
	return actionTemplates.find((t) => t.id === id) || triggerTemplates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: ActionCategory): Template[] {
	return [...actionsByCategory[category], ...triggersByCategory[category]];
}

export function getTemplatesByType(type: 'trigger' | 'action'): Template[] {
	if (type === 'trigger') {
		return triggerTemplates;
	}
	return actionTemplates;
}

export function searchTemplates(query: string): Template[] {
	const lowerQuery = query.toLowerCase();
	return [...actionTemplates, ...triggerTemplates].filter(
		(t) =>
			t.name.toLowerCase().includes(lowerQuery) ||
			t.description.toLowerCase().includes(lowerQuery) ||
			t.category.toLowerCase().includes(lowerQuery)
	);
}

export function validateTemplateConfig(
	template: Template,
	config: Record<string, unknown>
): {
	valid: boolean;
	missingFields: string[];
} {
	if (!template.requiredFields) {
		return { valid: true, missingFields: [] };
	}

	const missingFields = template.requiredFields.filter((field) => {
		const value = config[field];
		return !value || (Array.isArray(value) && value.length === 0);
	});

	return {
		valid: missingFields.length === 0,
		missingFields
	};
}

export function isTemplateReady(template: Template, config: Record<string, unknown>): boolean {
	const validation = validateTemplateConfig(template, config);
	return validation.valid;
}

export function getAllTemplates(): Template[] {
	return [...triggerTemplates, ...actionTemplates];
}

export function getActionTemplatesByCategory(category: ActionCategory): ActionTemplate[] {
	return actionsByCategory[category] || [];
}

export function getTriggerTemplatesByCategory(category: ActionCategory): TriggerTemplate[] {
	return triggersByCategory[category] || [];
}
