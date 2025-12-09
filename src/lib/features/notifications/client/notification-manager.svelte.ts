import { browser } from '$app/environment';
import type {
	NotificationPermissionState,
	BrowserSupport
} from '$lib/features/notifications/types';
import {
	subscribeToPushCommand,
	unsubscribeFromPushCommand,
	getPublicVapidKeyCommand
} from '../notifications.remote';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

class NotificationManager {
	private _browserSupport = $state<BrowserSupport>({
		notifications: false,
		serviceWorker: false,
		pushManager: false
	});

	private _permissionState = $state<NotificationPermissionState>('default');
	private _isSubscribed = $state(false);
	private _isLoading = $state(false);
	private _error = $state<string | null>(null);
	private _currentEndpoint = $state<string | null>(null);

	constructor() {
		this.checkBrowserSupport();
		this.checkPermissionState();
	}

	get browserSupport() {
		return this._browserSupport;
	}

	get permissionState() {
		return this._permissionState;
	}

	get isSubscribed() {
		return this._isSubscribed;
	}

	get isLoading() {
		return this._isLoading;
	}

	get error() {
		return this._error;
	}

	get currentEndpoint() {
		return this._currentEndpoint;
	}

	get isSupported() {
		return (
			this._browserSupport.notifications &&
			this._browserSupport.serviceWorker &&
			this._browserSupport.pushManager
		);
	}

	private checkBrowserSupport() {
		if (!browser) {
			this._browserSupport = {
				notifications: false,
				serviceWorker: false,
				pushManager: false
			};
			return;
		}

		this._browserSupport = {
			notifications: 'Notification' in window,
			serviceWorker: 'serviceWorker' in navigator,
			pushManager: 'PushManager' in window
		};
	}

	private checkPermissionState() {
		if (!browser || !this._browserSupport.notifications) {
			this._permissionState = 'unsupported';
			return;
		}

		this._permissionState = Notification.permission as NotificationPermissionState;
	}

	async requestPermission(): Promise<NotificationPermissionState> {
		if (!browser || !this.isSupported) {
			this._error = 'Push notifications are not supported in this browser';
			return 'unsupported';
		}

		try {
			const permission = await Notification.requestPermission();
			this._permissionState = permission as NotificationPermissionState;
			this._error = null;
			return this._permissionState;
		} catch (error) {
			console.error('Error requesting notification permission:', error);
			this._error = 'Failed to request notification permission';
			return 'denied';
		}
	}

	async subscribe(channelIds?: string[]): Promise<boolean> {
		if (!browser || !this.isSupported) {
			this._error = 'Push notifications are not supported';
			return false;
		}

		if (this._permissionState !== 'granted') {
			const permission = await this.requestPermission();
			if (permission !== 'granted') {
				this._error = 'Notification permission was denied';
				return false;
			}
		}

		this._isLoading = true;
		this._error = null;

		try {
			// Get VAPID public key from server
			const { publicKey } = await getPublicVapidKeyCommand();

			// Get service worker registration
			const registration = await navigator.serviceWorker.ready;

			// Subscribe to push notifications
			const applicationServerKey = urlBase64ToUint8Array(publicKey);
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: applicationServerKey as BufferSource
			});

			// Get subscription details
			const subscriptionJson = subscription.toJSON();
			const endpoint = subscription.endpoint;
			const p256dhKey = subscriptionJson.keys?.p256dh || '';
			const authKey = subscriptionJson.keys?.auth || '';

			// Save subscription to server
			await subscribeToPushCommand({
				endpoint,
				p256dhKey,
				authKey,
				channelIds: channelIds || []
			});

			this._isSubscribed = true;
			this._currentEndpoint = endpoint;
			this._error = null;

			return true;
		} catch (error) {
			console.error('Error subscribing to push notifications:', error);
			this._error =
				error instanceof Error ? error.message : 'Failed to subscribe to push notifications';
			this._isSubscribed = false;
			return false;
		} finally {
			this._isLoading = false;
		}
	}

	async updateChannels(channelIds: string[]): Promise<boolean> {
		if (!browser || !this._isSubscribed || !this._currentEndpoint) {
			this._error = 'Not subscribed to push notifications';
			return false;
		}

		this._isLoading = true;
		this._error = null;

		try {
			// Get current subscription
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();

			if (!subscription) {
				this._error = 'No active subscription found';
				this._isSubscribed = false;
				return false;
			}

			const subscriptionJson = subscription.toJSON();
			const p256dhKey = subscriptionJson.keys?.p256dh || '';
			const authKey = subscriptionJson.keys?.auth || '';

			// Update subscription on server
			await subscribeToPushCommand({
				endpoint: subscription.endpoint,
				p256dhKey,
				authKey,
				channelIds
			});

			this._error = null;
			return true;
		} catch (error) {
			console.error('Error updating push notification channels:', error);
			this._error =
				error instanceof Error ? error.message : 'Failed to update notification channels';
			return false;
		} finally {
			this._isLoading = false;
		}
	}

	async unsubscribe(): Promise<boolean> {
		if (!browser || !this._currentEndpoint) {
			this._error = 'No active subscription';
			return false;
		}

		this._isLoading = true;
		this._error = null;

		try {
			// Get current subscription
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();

			if (subscription) {
				// Unsubscribe from browser
				await subscription.unsubscribe();
			}

			// Remove subscription from server
			await unsubscribeFromPushCommand({
				endpoint: this._currentEndpoint
			});

			this._isSubscribed = false;
			this._currentEndpoint = null;
			this._error = null;

			return true;
		} catch (error) {
			console.error('Error unsubscribing from push notifications:', error);
			this._error =
				error instanceof Error ? error.message : 'Failed to unsubscribe from push notifications';
			return false;
		} finally {
			this._isLoading = false;
		}
	}

	async checkCurrentSubscription(): Promise<void> {
		if (!browser || !this.isSupported) {
			return;
		}

		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();

			if (subscription) {
				this._isSubscribed = true;
				this._currentEndpoint = subscription.endpoint;
			} else {
				this._isSubscribed = false;
				this._currentEndpoint = null;
			}
		} catch (error) {
			console.error('Error checking current subscription:', error);
			this._isSubscribed = false;
			this._currentEndpoint = null;
		}
	}
}

export function createNotificationManager() {
	return new NotificationManager();
}
