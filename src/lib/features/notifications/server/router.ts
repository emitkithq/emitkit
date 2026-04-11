import { z } from 'zod';
import { base, middleware } from '$lib/server/rpc';
import { ORPCError } from '@orpc/server';
import {
	upsertPushSubscription,
	deletePushSubscription,
	getVapidPublicKey
} from '$lib/features/notifications/server';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('notifications-router');

const authed = base.use(middleware.auth);

const subscribeToPush = authed
	.input(
		z.object({
			endpoint: z.url(),
			p256dhKey: z.string(),
			authKey: z.string(),
			channelIds: z.array(z.string()).optional().default([])
		})
	)
	.handler(async ({ input, context }) => {
		const { user, activeOrganization } = context;

		try {
			const subscription = await upsertPushSubscription({
				userId: user.id,
				organizationId: activeOrganization.id,
				endpoint: input.endpoint,
				p256dhKey: input.p256dhKey,
				authKey: input.authKey,
				channelIds: input.channelIds
			});

			return {
				success: true,
				subscription: {
					id: subscription.id,
					endpoint: subscription.endpoint,
					channelIds: subscription.channelIds
				}
			};
		} catch (error) {
			logger.error('Failed to subscribe to push', error as Error, {
				userId: user.id,
				organizationId: activeOrganization.id
			});
			throw error;
		}
	});

const unsubscribeFromPush = authed
	.input(
		z.object({
			endpoint: z.url()
		})
	)
	.handler(async ({ input, context }) => {
		const { user } = context;

		try {
			const deleted = await deletePushSubscription(user.id, input.endpoint);

			if (!deleted) {
				throw new ORPCError('NOT_FOUND', { message: 'Subscription not found' });
			}

			return {
				success: true,
				message: 'Successfully unsubscribed from push notifications'
			};
		} catch (error) {
			logger.error('Failed to unsubscribe from push', error as Error, {
				userId: user.id
			});
			throw error;
		}
	});

const getPublicVapidKey = base.handler(async () => {
	const publicKey = getVapidPublicKey();

	if (!publicKey) {
		throw new ORPCError('NOT_FOUND', {
			message: 'Push notifications not configured. VAPID keys not found in environment variables.'
		});
	}

	return { publicKey };
});

export const notificationsRouter = {
	subscribeToPush,
	unsubscribeFromPush,
	getPublicVapidKey
};
