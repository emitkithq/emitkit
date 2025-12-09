import type { PushSubscription } from '$lib/server/db/schema';
import type { Project } from '$lib/features/projects/types';
import type { Channel } from '$lib/features/channels/types';

export type { PushSubscription };

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export type BrowserSupport = {
	notifications: boolean;
	serviceWorker: boolean;
	pushManager: boolean;
};

export type SubscriptionState = {
	isSubscribed: boolean;
	subscription: PushSubscription | null;
	permissionState: NotificationPermissionState;
	browserSupport: BrowserSupport;
};

export type ProjectWithChannels = Project & {
	channels: Channel[];
};

export type NotificationSettings = {
	enabledProjects: Set<string>;
	enabledChannels: Set<string>;
	subscribeToAll: boolean;
};
