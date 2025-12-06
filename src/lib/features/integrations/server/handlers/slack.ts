import type { Event } from '$lib/server/db/schema';
import { createContextLogger } from '$lib/server/logger';
import { postMessage } from '$lib/features/integrations/server/slack-api';

const logger = createContextLogger('slack-integration');

export async function sendSlackNotification(
	config: Record<string, unknown>,
	event: Event
): Promise<void> {
	// Support both bot token (new) and webhook URL (legacy) for backward compatibility
	const botToken = config.botToken as string | undefined;
	const slackChannelId = config.slackChannelId as string | undefined;
	const webhookUrl = config.webhookUrl as string | undefined;

	if (botToken && slackChannelId) {
		// New bot token flow (preferred)
		await sendViaBotToken(botToken, slackChannelId, event);
	} else if (webhookUrl) {
		// Legacy webhook flow (deprecated)
		logger.warn('Using deprecated webhook flow. Please migrate to bot tokens.', {
			eventId: event.id
		});
		await sendViaWebhook(webhookUrl, event);
	} else {
		throw new Error('Slack integration not properly configured (missing bot token or webhook URL)');
	}
}

/**
 * Send notification using Slack bot token (new preferred method)
 */
async function sendViaBotToken(botToken: string, channelId: string, event: Event): Promise<void> {
	const message = {
		text: event.title,
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*${event.title}*${event.description ? `\n${event.description}` : ''}`
				}
			},
			{
				type: 'context',
				elements: [
					{
						type: 'mrkdwn',
						text: `Event ID: ${event.id} • ${new Date(event.createdAt).toLocaleString()}`
					}
				]
			}
		]
	};

	const result = await postMessage(botToken, channelId, message);

	if (!result.success) {
		throw new Error(`Slack API error: ${result.error}`);
	}

	logger.success('Slack notification sent via bot token', {
		eventId: event.id,
		channelId,
		timestamp: result.timestamp
	});
}

/**
 * Send notification using webhook URL (legacy method)
 * @deprecated Use bot tokens instead
 */
async function sendViaWebhook(webhookUrl: string, event: Event): Promise<void> {
	const slackPayload = {
		text: event.title,
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*${event.title}*${event.description ? `\n${event.description}` : ''}`
				}
			},
			{
				type: 'context',
				elements: [
					{
						type: 'mrkdwn',
						text: `Channel: ${event.channelId} • ${new Date(event.createdAt).toLocaleString()}`
					}
				]
			}
		]
	};

	const response = await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(slackPayload),
		signal: AbortSignal.timeout(10000) // 10s timeout
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Slack webhook error: ${response.status} ${errorText}`);
	}

	logger.success('Slack notification sent via webhook', {
		eventId: event.id,
		channelId: event.channelId
	});
}
