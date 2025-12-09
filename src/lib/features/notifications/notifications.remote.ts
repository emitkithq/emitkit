import { command, getRequestEvent } from '$app/server';
import { z } from 'zod';
import { upsertPushSubscription, deletePushSubscription, getVapidPublicKey } from './server';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('notifications-remote');

const subscribeToPushSchema = z.object({
	endpoint: z.url(),
	p256dhKey: z.string(),
	authKey: z.string(),
	channelIds: z.array(z.string()).optional().default([])
});

export const subscribeToPushCommand = command(subscribeToPushSchema, async (input) => {
	const { locals } = getRequestEvent();
	const { user, activeOrganization } = locals;

	if (!user || !activeOrganization) {
		const error = new Error('Unauthorized');
		logger.error('Command failed', error, { action: 'subscribeToPush' });
		throw error;
	}

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
		logger.error('Command failed', error as Error, {
			action: 'subscribeToPush',
			userId: user.id,
			organizationId: activeOrganization.id
		});
		throw error;
	}
});

const unsubscribeFromPushSchema = z.object({
	endpoint: z.url()
});

export const unsubscribeFromPushCommand = command(unsubscribeFromPushSchema, async (input) => {
	const { locals } = getRequestEvent();
	const { user } = locals;

	if (!user) {
		const error = new Error('Unauthorized');
		logger.error('Command failed', error, { action: 'unsubscribeFromPush' });
		throw error;
	}

	try {
		const deleted = await deletePushSubscription(user.id, input.endpoint);

		if (!deleted) {
			const error = new Error('Subscription not found');
			logger.error('Command failed', error, {
				action: 'unsubscribeFromPush',
				userId: user.id,
				endpoint: input.endpoint
			});
			throw error;
		}

		return {
			success: true,
			message: 'Successfully unsubscribed from push notifications'
		};
	} catch (error) {
		logger.error('Command failed', error as Error, {
			action: 'unsubscribeFromPush',
			userId: user.id
		});
		throw error;
	}
});

export const getPublicVapidKeyCommand = command(async () => {
	const publicKey = getVapidPublicKey();

	if (!publicKey) {
		const error = new Error(
			'Push notifications not configured. VAPID keys not found in environment variables.'
		);
		logger.error('Command failed', error, { action: 'getPublicVapidKey' });
		throw error;
	}

	return { publicKey };
});
