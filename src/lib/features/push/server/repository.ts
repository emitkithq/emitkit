import { db, schema } from '$lib/server/db';
import { and, eq, sql } from 'drizzle-orm';
import type { PushSubscription, PushSubscriptionInsert } from '../types';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('push-subscriptions');

export async function createSubscription(
	subscription: PushSubscriptionInsert
): Promise<PushSubscription> {
	const now = new Date();

	const [created] = await db
		.insert(schema.pushSubscription)
		.values({
			...subscription,
			createdAt: subscription.createdAt ?? now
		})
		.returning();

	if (!created) {
		const error = new Error('Failed to create push subscription');
		logger.error('Push subscription creation failed', error, {
			userId: subscription.userId,
			organizationId: subscription.organizationId,
			channelCount: subscription.channelIds?.length ?? 0
		});
		throw error;
	}

	logger.info('Push subscription created', {
		id: created.id,
		userId: created.userId,
		organizationId: created.organizationId,
		channelCount: created.channelIds?.length ?? 0,
		endpoint: created.endpoint
	});

	return created;
}

export async function getSubscriptionsByChannel(
	channelId: string,
	orgId: string
): Promise<PushSubscription[]> {
	// Verify channel belongs to organization
	const [channelCheck] = await db
		.select()
		.from(schema.channel)
		.where(and(eq(schema.channel.id, channelId), eq(schema.channel.organizationId, orgId)))
		.limit(1);

	if (!channelCheck) {
		logger.warn('Channel not found or access denied when fetching push subscriptions', {
			channelId,
			organizationId: orgId
		});
		return [];
	}

	// Find subscriptions where channelIds array contains this channel
	// Uses PostgreSQL's @> operator to check if array contains the value
	const results = await db
		.select()
		.from(schema.pushSubscription)
		.where(
			and(
				eq(schema.pushSubscription.organizationId, orgId),
				sql`${schema.pushSubscription.channelIds} @> ${JSON.stringify([channelId])}::jsonb`
			)
		);

	return results as PushSubscription[];
}

export async function getSubscriptionsByUser(
	userId: string,
	orgId: string
): Promise<PushSubscription[]> {
	const results = await db.query.pushSubscription.findMany({
		where: and(
			eq(schema.pushSubscription.userId, userId),
			eq(schema.pushSubscription.organizationId, orgId)
		),
		orderBy: (subscriptions, { desc }) => [desc(subscriptions.createdAt)]
	});

	return results as PushSubscription[];
}

export async function deleteSubscription(id: string): Promise<void> {
	await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, id));

	logger.info('Push subscription deleted', { id });
}

export async function deleteSubscriptionByEndpoint(
	userId: string,
	endpoint: string
): Promise<void> {
	await db
		.delete(schema.pushSubscription)
		.where(
			and(
				eq(schema.pushSubscription.userId, userId),
				eq(schema.pushSubscription.endpoint, endpoint)
			)
		);

	logger.info('Push subscription deleted by endpoint', { userId, endpoint });
}
