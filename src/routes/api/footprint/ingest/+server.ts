/**
 * Analytics Proxy Endpoint
 *
 * This endpoint receives analytics events from the client-side ProxyProvider
 * and forwards them to server-side analytics providers (Bento).
 *
 * Benefits:
 * - Bypasses ad-blockers
 * - Server-side data enrichment (IP, user-agent)
 * - Privacy-friendly (events go through your domain)
 * - No third-party scripts loaded in browser
 */

import { createProxyHandler } from '@stacksee/analytics/providers/server';
import { json, type RequestHandler } from '@sveltejs/kit';
import { analytics } from '$lib/features/analytics/server/analytics';
import { createContextLogger } from '$lib/server/logger';

/**
 * POST /api/footprint/ingest
 *
 * Receives batched analytics events from ProxyProvider and forwards them
 * to configured server-side analytics providers.
 *
 * The createProxyHandler automatically:
 * - Parses the proxy event payload
 * - Extracts IP from headers (X-Forwarded-For, X-Real-IP)
 * - Enriches context with server-side data
 * - Replays events through analytics
 * - Handles errors gracefully
 */
export const POST: RequestHandler = async ({ request }) => {
	const logger = createContextLogger('analytics-proxy');

	try {
		// Use the built-in proxy handler
		const handler = createProxyHandler(analytics);

		// Process the request
		return await handler(request);
	} catch (error) {
		logger.error('Failed to process analytics events', error instanceof Error ? error : undefined);
		// Return success anyway - analytics should never break the app
		return json({ success: true });
	}
};
