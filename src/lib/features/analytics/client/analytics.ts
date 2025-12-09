import { createClientAnalytics } from '@stacksee/analytics/client';
import { ProxyProvider } from '@stacksee/analytics/providers/client';
import { browser, dev } from '$app/environment';
import type { AppEvents } from '../events';

export const clientAnalytics = createClientAnalytics<AppEvents>({
	providers: [
		new ProxyProvider({
			// Send events to our own API endpoint
			endpoint: '/api/footprint/ingest',

			// Batching configuration
			batch: {
				size: 10, // Send after 10 events
				interval: 5000 // Or after 5 seconds
			},

			// Retry configuration
			retry: {
				attempts: 3,
				backoff: 'exponential',
				initialDelay: 1000
			},

			// Debug mode in development
			debug: dev,

			// Always enabled
			enabled: true
		})
	],
	debug: dev,
	enabled: browser && import.meta.env.PROD
});
