import type { Integration, IntegrationInsert } from '$lib/server/db/schema';
import type { IntegrationDefinition } from './constants';

export type { Integration, IntegrationInsert };

export type IntegrationType = 'slack' | 'discord' | 'email' | 'teams' | 'custom';

export interface IntegrationConfig {
	// Legacy webhook support (deprecated)
	webhookUrl?: string;

	// Bot token authentication (preferred)
	botToken?: string;

	// Slack-specific config
	slackChannelId?: string; // Slack channel ID for posting messages
	slackWorkspaceName?: string; // Workspace name for display

	// Other integrations
	apiKey?: string;
	channelId?: string;
	email?: string;
	[key: string]: unknown;
}

export type IntegrationWithMetadata = Integration & {
	definition: IntegrationDefinition;
};
