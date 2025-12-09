import { db } from '$lib/server/db';
import {
	pushSubscription as pushSubscriptionTable,
	type PushSubscription
} from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function upsertPushSubscription(data: {
	userId: string;
	organizationId: string;
	endpoint: string;
	p256dhKey: string;
	authKey: string;
	channelIds?: string[];
}): Promise<PushSubscription> {
	const existing = await db.query.pushSubscription.findFirst({
		where: (ps, { and, eq }) => and(eq(ps.userId, data.userId), eq(ps.endpoint, data.endpoint))
	});

	if (existing) {
		// Update existing subscription (channel subscriptions may have changed)
		const [updated] = await db
			.update(pushSubscriptionTable)
			.set({
				channelIds: data.channelIds || existing.channelIds
			})
			.where(eq(pushSubscriptionTable.id, existing.id))
			.returning();

		return updated;
	}

	// Create new subscription
	const [subscription] = await db
		.insert(pushSubscriptionTable)
		.values({
			userId: data.userId,
			organizationId: data.organizationId,
			endpoint: data.endpoint,
			p256dhKey: data.p256dhKey,
			authKey: data.authKey,
			channelIds: data.channelIds || []
		})
		.returning();

	return subscription;
}

export async function getUserPushSubscriptions(userId: string): Promise<PushSubscription[]> {
	return db.query.pushSubscription.findMany({
		where: (ps, { eq }) => eq(ps.userId, userId)
	});
}

export async function getPushSubscriptionByEndpoint(
	userId: string,
	endpoint: string
): Promise<PushSubscription | null> {
	const result = await db.query.pushSubscription.findFirst({
		where: (ps, { and, eq }) => and(eq(ps.userId, userId), eq(ps.endpoint, endpoint))
	});

	return result ?? null;
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<boolean> {
	await db
		.delete(pushSubscriptionTable)
		.where(
			and(eq(pushSubscriptionTable.userId, userId), eq(pushSubscriptionTable.endpoint, endpoint))
		);

	// Verify deletion by checking if subscription still exists
	const remaining = await getPushSubscriptionByEndpoint(userId, endpoint);
	return !remaining;
}

export async function deleteAllUserPushSubscriptions(userId: string): Promise<number> {
	const subscriptionsBefore = await getUserPushSubscriptions(userId);
	const countBefore = subscriptionsBefore.length;

	await db.delete(pushSubscriptionTable).where(eq(pushSubscriptionTable.userId, userId));

	return countBefore;
}

export async function subscribeToChannels(
	userId: string,
	endpoint: string,
	channelIds: string[]
): Promise<PushSubscription> {
	const subscription = await getPushSubscriptionByEndpoint(userId, endpoint);

	if (!subscription) {
		throw new Error('Subscription not found');
	}

	// Merge with existing channel subscriptions (avoid duplicates)
	const updatedChannelIds = [...new Set([...subscription.channelIds, ...channelIds])];

	const [updated] = await db
		.update(pushSubscriptionTable)
		.set({ channelIds: updatedChannelIds })
		.where(eq(pushSubscriptionTable.id, subscription.id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update subscription');
	}

	return updated;
}

export async function unsubscribeFromChannels(
	userId: string,
	endpoint: string,
	channelIds: string[]
): Promise<PushSubscription> {
	const subscription = await getPushSubscriptionByEndpoint(userId, endpoint);

	if (!subscription) {
		throw new Error('Subscription not found');
	}

	// Remove specified channels
	const updatedChannelIds = subscription.channelIds.filter((id) => !channelIds.includes(id));

	const [updated] = await db
		.update(pushSubscriptionTable)
		.set({ channelIds: updatedChannelIds })
		.where(eq(pushSubscriptionTable.id, subscription.id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update subscription');
	}

	return updated;
}

export async function getChannelPushSubscriptions(channelId: string): Promise<PushSubscription[]> {
	// Use raw SQL to query JSONB array contains
	return db
		.select()
		.from(pushSubscriptionTable)
		.where(sql`${pushSubscriptionTable.channelIds} @> ${JSON.stringify([channelId])}`);
}
