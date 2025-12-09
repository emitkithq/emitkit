import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	buildPaginatedQuery,
	type PaginatedQueryResult,
	type PaginationParams
} from '$lib/server/db/utils';
import type { Webhook, WebhookInsert } from '$lib/server/db';
import type { WebhookUpdate } from '../types';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('webhooks');

export async function createWebhook(webhook: WebhookInsert): Promise<Webhook> {
	const now = new Date();

	const [created] = await db
		.insert(schema.webhook)
		.values({
			...webhook,
			createdAt: webhook.createdAt ?? now,
			updatedAt: webhook.updatedAt ?? now
		})
		.returning();

	if (!created) {
		const error = new Error('Cannot create webhook');
		logger.error('Webhook creation failed', error, {
			organizationId: webhook.organizationId,
			channelId: webhook.channelId,
			url: webhook.url,
			events: webhook.events
		});
		throw error;
	}

	logger.info('Webhook created', {
		id: created.id,
		organizationId: created.organizationId,
		channelId: created.channelId,
		url: created.url,
		events: created.events,
		enabled: created.enabled
	});

	return created;
}

export async function getWebhook(id: string, orgId: string): Promise<Webhook | null> {
	const webhook = await db.query.webhook.findFirst({
		where: and(eq(schema.webhook.id, id), eq(schema.webhook.organizationId, orgId))
	});

	return webhook ?? null;
}

export async function listWebhooks(channelId: string, orgId: string): Promise<Webhook[]> {
	// Verify channel belongs to organization
	const [channelCheck] = await db
		.select()
		.from(schema.channel)
		.where(and(eq(schema.channel.id, channelId), eq(schema.channel.organizationId, orgId)))
		.limit(1);

	if (!channelCheck) {
		logger.warn('Channel not found or access denied when listing webhooks', {
			channelId,
			organizationId: orgId
		});
		return [];
	}

	// Only return enabled webhooks
	const webhooks = await db.query.webhook.findMany({
		where: and(eq(schema.webhook.channelId, channelId), eq(schema.webhook.enabled, true)),
		orderBy: (webhooks, { desc }) => [desc(webhooks.createdAt)]
	});

	return webhooks;
}

export async function listWebhooksByOrg(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Webhook>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	const query = db.query.webhook.findMany({
		where: eq(schema.webhook.organizationId, orgId),
		orderBy: (webhooks, { desc }) => [desc(webhooks.createdAt)],
		limit,
		offset
	});

	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.webhook)
		.where(eq(schema.webhook.organizationId, orgId));

	const result = await buildPaginatedQuery(query, countQuery, { page, limit });

	return result;
}

export async function updateWebhook(id: string, updates: WebhookUpdate): Promise<Webhook> {
	const now = new Date();

	const [updated] = await db
		.update(schema.webhook)
		.set({
			...updates,
			updatedAt: now
		})
		.where(eq(schema.webhook.id, id))
		.returning();

	if (!updated) {
		const error = new Error('Cannot update webhook');
		logger.error('Webhook update failed', error, { id, updatedFields: Object.keys(updates) });
		throw error;
	}

	logger.info('Webhook updated', {
		id: updated.id,
		updatedFields: Object.keys(updates),
		organizationId: updated.organizationId
	});

	return updated;
}

export async function deleteWebhook(id: string): Promise<void> {
	await db.delete(schema.webhook).where(eq(schema.webhook.id, id));

	logger.info('Webhook deleted', { id });
}
