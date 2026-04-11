/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache static assets — vite-pwa injects the manifest at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Message handler — allows clients to trigger skipWaiting when user accepts update
 */
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

/**
 * Push event — receive and display push notifications
 */
self.addEventListener('push', (event) => {
	if (!event.data) return;

	try {
		const data = event.data.json();

		const title = data.title || 'New Event';
		const options = {
			body: data.body || data.description || '',
			icon: data.icon || '/web-app-manifest-192x192.png',
			badge: '/favicon-96x96.png',
			tag: data.tag || data.eventId || 'notification',
			data: data.data || data,
			requireInteraction: data.requireInteraction || false,
			vibrate: [200, 100, 200]
		} satisfies NotificationOptions & { vibrate?: number[] };

		event.waitUntil(self.registration.showNotification(title, options));
	} catch (error) {
		console.error('Error processing push notification:', error);
	}
});

/**
 * Notification click event — handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data;
	const urlToOpen = data?.url || data?.channelUrl || '/';

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}

			if (self.clients.openWindow) {
				return self.clients.openWindow(urlToOpen);
			}
		})
	);
});

/**
 * Background sync — retry failed requests
 */
self.addEventListener(
	'sync' as string,
	((event: SyncEvent) => {
		if (event.tag === 'sync-events') {
			event.waitUntil(syncEvents());
		}
	}) as EventListener
);

interface SyncEvent extends ExtendableEvent {
	tag: string;
}

async function syncEvents() {
	console.log('Background sync triggered');
}
