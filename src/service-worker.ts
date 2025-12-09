/**
 * Service Worker - PWA + Push Notifications
 *
 * Handles:
 * - Asset caching for offline support
 * - Push notification reception and display
 * - Background sync for failed requests
 */

/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Declare deployment ID injected by Vite (may not be available in service worker context)
declare const __DEPLOYMENT_ID__: string | undefined;

// Cache name includes both SvelteKit version and deployment ID for proper cache busting
// Falls back to timestamp if __DEPLOYMENT_ID__ is not available
const DEPLOYMENT_ID =
	typeof __DEPLOYMENT_ID__ !== 'undefined' ? __DEPLOYMENT_ID__ : `dev-${Date.now()}`;
const CACHE_NAME = `cache-${version}-${DEPLOYMENT_ID}`;
const ASSETS = [...build, ...files];

/**
 * Install event - cache all static assets
 * Note: We DON'T call skipWaiting() here to avoid breaking the current session.
 * The new SW will wait until all tabs are closed before activating.
 */
sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => {
				// Tell clients a new version is available
				sw.clients.matchAll({ type: 'window' }).then((clients) => {
					clients.forEach((client) => {
						client.postMessage({
							type: 'SW_UPDATE_AVAILABLE'
						});
					});
				});
			})
	);
});

/**
 * Message handler - allows clients to trigger skipWaiting when user accepts update
 */
sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
});

/**
 * Activate event - clean up old caches
 */
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE_NAME) await caches.delete(key);
			}
			sw.clients.claim();
		})
	);
});

/**
 * Fetch event - cache only static assets
 * Strategy: CacheFirst for static assets, NetworkOnly for everything else
 *
 * Static assets only (JS, CSS, images, fonts) - these are cached
 * API routes, pages, streams - ALWAYS fetch fresh from network
 */
sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip cross-origin requests
	if (url.origin !== location.origin) return;

	// Only cache static assets from the build
	// Everything else (API routes, pages, streams) hits the network
	const isStaticAsset = ASSETS.includes(url.pathname);

	if (!isStaticAsset) {
		// NetworkOnly: API routes, pages, streams always fetch fresh
		return;
	}

	// CacheFirst for static assets only
	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;

			return fetch(event.request).then(async (response) => {
				// Cache new static resources
				if (response.ok) {
					const responseClone = response.clone();
					const cache = await caches.open(CACHE_NAME);
					cache.put(event.request, responseClone);
				}
				return response;
			});
		})
	);
});

/**
 * Push event - receive and display push notifications
 */
sw.addEventListener('push', (event) => {
	if (!event.data) return;

	try {
		const data = event.data.json();

		// Extract notification data
		const title = data.title || 'New Event';
		const options: NotificationOptions = {
			body: data.body || data.description || '',
			icon: data.icon || '/web-app-manifest-192x192.png',
			badge: '/favicon-96x96.png',
			tag: data.tag || data.eventId || 'notification',
			data: data.data || data,
			requireInteraction: data.requireInteraction || false,
			actions: data.actions || [],
			vibrate: [200, 100, 200]
		};

		event.waitUntil(sw.registration.showNotification(title, options));
	} catch (error) {
		console.error('Error processing push notification:', error);
	}
});

/**
 * Notification click event - handle notification clicks
 */
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data;
	const urlToOpen = data?.url || data?.channelUrl || '/';

	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Check if there's already a window open
			for (const client of clientList) {
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}

			// Open new window if none exists
			if (sw.clients.openWindow) {
				return sw.clients.openWindow(urlToOpen);
			}
		})
	);
});

/**
 * Background sync - retry failed requests
 */
sw.addEventListener('sync', (event) => {
	if (event.tag === 'sync-events') {
		event.waitUntil(syncEvents());
	}
});

/**
 * Sync failed event creations
 */
async function syncEvents() {
	// Implementation for background sync
	// This would retry any failed API calls stored in IndexedDB
	console.log('Background sync triggered');
}
