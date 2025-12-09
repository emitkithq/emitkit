import { createHmac } from 'node:crypto';
import type { Webhook, Event } from '$lib/server/db';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('webhooks');

export function generateSignature(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function sendWebhook(webhook: Webhook, event: Event): Promise<void> {
	const payload = JSON.stringify({
		event_id: event.id,
		channel_id: event.channelId,
		title: event.title,
		description: event.description,
		icon: event.icon,
		tags: event.tags,
		metadata: event.metadata,
		user_id: event.userId,
		created_at: event.createdAt.toISOString()
	});

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'User-Agent': 'EmitKit/1.0'
	};

	// Add HMAC signature if secret provided
	if (webhook.secret) {
		const signature = generateSignature(payload, webhook.secret);
		headers['X-Webhook-Signature'] = signature;
	}

	const response = await fetch(webhook.url, {
		method: 'POST',
		headers,
		body: payload,
		signal: AbortSignal.timeout(30000) // 30s timeout
	});

	if (!response.ok) {
		throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
	}
}

export async function dispatchWebhooks(webhooks: Webhook[], event: Event): Promise<void> {
	// Send webhooks in parallel, catching errors for each
	await Promise.allSettled(
		webhooks.map(async (webhook) => {
			try {
				await sendWebhook(webhook, event);
			} catch (error) {
				logger.error('Webhook dispatch failed', error instanceof Error ? error : undefined, {
					url: webhook.url,
					webhookId: webhook.id,
					eventId: event.id,
					channelId: event.channelId
				});
				// Don't throw - let other webhooks continue
			}
		})
	);
}
