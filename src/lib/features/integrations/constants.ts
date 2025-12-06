import type { Component } from 'svelte';
import SlackIcon from '@lucide/svelte/icons/slack';

export type IntegrationDefinition = {
	id: string;
	name: string;
	description: string;
	icon: Component;
	status: 'available' | 'coming_soon';
	category: 'notification' | 'messaging' | 'email';
	requiresOAuth: boolean;
	configFields: {
		webhookUrl?: boolean;
		botToken?: boolean;
		slackChannelId?: boolean;
		apiKey?: boolean;
		channelId?: boolean;
		email?: boolean;
	};
};

export const AVAILABLE_INTEGRATIONS: IntegrationDefinition[] = [
	{
		id: 'slack',
		name: 'Slack',
		description: 'Send event notifications to Slack channels using a bot token',
		icon: SlackIcon,
		status: 'available',
		category: 'messaging',
		requiresOAuth: false,
		configFields: { botToken: true, slackChannelId: true }
	}
	// Discord, Email, and Webhooks are handled via workflow action types
];

export function getIntegrationDefinition(type: string): IntegrationDefinition | undefined {
	return AVAILABLE_INTEGRATIONS.find((i) => i.id === type);
}
