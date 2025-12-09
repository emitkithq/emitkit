export type { PushSubscription, PushSubscriptionInsert } from '$lib/server/db/schema';

export interface SubscribeToPushInput {
	organizationId: string;
	channelIds: string[];
	subscription: {
		endpoint: string;
		keys: {
			p256dh: string;
			auth: string;
		};
	};
}
