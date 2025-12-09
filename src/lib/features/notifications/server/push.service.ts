import webpush from 'web-push';
import { db } from '$lib/server/db';
import { pushSubscription as pushSubscriptionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { VAPID_KEY, VAPID_SUBJECT } from '$env/static/private';

const logger = createLogger('push-notifications');

export type PushNotificationPayload = {
	title: string;
	body?: string;
	description?: string;
	icon?: string;
	badge?: string;
	tag?: string;
	data?: Record<string, unknown>;
	url?: string;
	requireInteraction?: boolean;
	actions?: Array<{
		action: string;
		title: string;
		icon?: string;
	}>;
};

function initializeWebPush() {
	const vapidPublicKey = PUBLIC_VAPID_KEY;
	const vapidPrivateKey = VAPID_KEY;
	const vapidSubject = VAPID_SUBJECT;

	if (!vapidPublicKey || !vapidPrivateKey) {
		logger.warn('VAPID keys not configured - Push notifications disabled', {
			message: 'Generate keys with: pnpm dlx web-push generate-vapid-keys'
		});
		return false;
	}

	webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
	return true;
}

// Initialize on module load
const isConfigured = initializeWebPush();

export async function sendPushNotification(
	userId: string,
	payload: PushNotificationPayload
): Promise<{
	success: number;
	failed: number;
	errors: Array<{ endpoint: string; error: string }>;
}> {
	if (!isConfigured) {
		logger.warn('Push notifications not configured, skipping send', { userId });
		return { success: 0, failed: 0, errors: [] };
	}

	// Get all subscriptions for this user
	const subscriptions = await db.query.pushSubscription.findMany({
		where: (ps, { eq }) => eq(ps.userId, userId)
	});

	if (subscriptions.length === 0) {
		logger.info('No push subscriptions found for user', { userId });
		return { success: 0, failed: 0, errors: [] };
	}

	// Send to all devices
	const results = await Promise.allSettled(
		subscriptions.map(async (subscription) => {
			try {
				const pushSubscription = {
					endpoint: subscription.endpoint,
					keys: {
						p256dh: subscription.p256dhKey,
						auth: subscription.authKey
					}
				};

				await webpush.sendNotification(pushSubscription, JSON.stringify(payload));

				return { success: true, endpoint: subscription.endpoint };
			} catch (error) {
				// Handle expired/invalid subscriptions
				const errorMessage = error instanceof Error ? error.message : '';
				const isExpired =
					errorMessage.includes('410') || // Gone - subscription expired
					errorMessage.includes('404') || // Not found
					errorMessage.includes('InvalidSubscription') ||
					errorMessage.includes('Received unexpected response code'); // Web push library error

				if (isExpired) {
					logger.info('Removing expired push subscription', {
						endpoint: subscription.endpoint,
						subscriptionId: subscription.id,
						userId
					});

					// Delete expired subscription
					await db
						.delete(pushSubscriptionTable)
						.where(eq(pushSubscriptionTable.id, subscription.id));

					return {
						success: false,
						endpoint: subscription.endpoint,
						error: 'expired',
						silent: true
					};
				}

				logger.error(
					'Error sending push notification',
					error instanceof Error ? error : undefined,
					{
						endpoint: subscription.endpoint,
						userId
					}
				);
				return {
					success: false,
					endpoint: subscription.endpoint,
					error: errorMessage || 'Unknown error',
					silent: false
				};
			}
		})
	);

	// Aggregate results
	const stats = {
		success: 0,
		failed: 0,
		errors: [] as Array<{ endpoint: string; error: string }>
	};

	results.forEach((result) => {
		if (result.status === 'fulfilled' && result.value.success) {
			stats.success++;
		} else if (result.status === 'fulfilled' && !result.value.success) {
			// Don't count expired subscriptions as failures (they're cleaned up automatically)
			if (!('silent' in result.value) || !result.value.silent) {
				stats.failed++;
				stats.errors.push({
					endpoint: result.value.endpoint,
					error: result.value.error || 'Unknown error'
				});
			}
		} else if (result.status === 'rejected') {
			stats.failed++;
			stats.errors.push({
				endpoint: 'unknown',
				error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
			});
		}
	});

	return stats;
}

export async function sendPushNotificationToUsers(
	userIds: string[],
	payload: PushNotificationPayload
): Promise<Record<string, { success: number; failed: number }>> {
	const results = await Promise.all(
		userIds.map(async (userId) => {
			const stats = await sendPushNotification(userId, payload);
			return { userId, stats };
		})
	);

	return results.reduce(
		(acc, { userId, stats }) => {
			acc[userId] = { success: stats.success, failed: stats.failed };
			return acc;
		},
		{} as Record<string, { success: number; failed: number }>
	);
}

export async function sendPushNotificationToChannels(
	channelIds: string[],
	payload: PushNotificationPayload
): Promise<{
	totalSuccess: number;
	totalFailed: number;
	byUser: Record<string, { success: number; failed: number }>;
}> {
	logger.info('Sending push notifications to channels', {
		channelIds,
		payloadTitle: payload.title
	});

	// Get all subscriptions, then filter in-memory
	// This is simpler and avoids complex SQL array handling issues
	const allSubscriptions = await db.select().from(pushSubscriptionTable);

	// Filter subscriptions that match the target channels
	const subscriptions = allSubscriptions.filter((sub) => {
		// Empty channelIds means "subscribe to all channels"
		if (!sub.channelIds || sub.channelIds.length === 0) {
			return true;
		}
		// Check if any of the target channels are in the subscription
		return channelIds.some((channelId) => sub.channelIds.includes(channelId));
	});

	logger.info('Found push subscriptions', {
		subscriptionCount: subscriptions.length,
		channelIds
	});

	// Group by user
	const userIds = [...new Set(subscriptions.map((sub) => sub.userId))];

	logger.info('Sending to users', {
		userCount: userIds.length,
		userIds
	});

	// Send to each user
	const byUser = await sendPushNotificationToUsers(userIds, payload);

	// Calculate totals
	const totalSuccess = Object.values(byUser).reduce((sum, stats) => sum + stats.success, 0);
	const totalFailed = Object.values(byUser).reduce((sum, stats) => sum + stats.failed, 0);

	logger.info('Push notification results', {
		totalSuccess,
		totalFailed,
		channelIds
	});

	return { totalSuccess, totalFailed, byUser };
}

export function getVapidPublicKey(): string | null {
	return PUBLIC_VAPID_KEY || null;
}
