import { z } from 'zod';

export const pushSubscriptionKeysSchema = z.object({
	p256dh: z.string().min(1),
	auth: z.string().min(1)
});

export const pushSubscriptionDataSchema = z.object({
	endpoint: z.url(),
	keys: pushSubscriptionKeysSchema
});

export const subscribeToPushSchema = z.object({
	organizationId: z.string().min(1),
	channelIds: z.array(z.string()).default([]),
	subscription: pushSubscriptionDataSchema
});

export const unsubscribeFromPushSchema = z.object({
	subscriptionId: z.string().min(1),
	organizationId: z.string().min(1)
});

export const getSubscriptionsByUserSchema = z.object({
	userId: z.string().min(1),
	organizationId: z.string().min(1)
});

export const getSubscriptionsByChannelSchema = z.object({
	channelId: z.string().min(1),
	organizationId: z.string().min(1)
});
