import type { RequestHandler } from './$types';
import { createContextLogger } from '$lib/server/logger';
import { error } from '@sveltejs/kit';

const POLL_INTERVAL_MS = 5000;

export const GET: RequestHandler = async ({ locals }) => {
	const logger = createContextLogger('org-event-stream');

	try {
		const authContext = locals.authContext;
		if (!authContext || !authContext.organizationId) {
			return error(401, 'Unauthorized');
		}

		const orgId = authContext.organizationId;

		// Sets up SSE stream for organization-wide events with cached polling
		// Architecture: Clients poll every 5s -> Hits Redis cache (3s TTL) -> Tinybird queried once per 3s window
		// This reduces Tinybird QPS from (N clients * 0.2) to just ~0.33 QPS total
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let lastCheck = new Date();
				let isActive = true;

				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

				const poll = async () => {
					while (isActive) {
						try {
							// Query for events across all channels in organization since last check
							// Note: This will hit multiple channels, but Redis cache helps reduce load
							// We'll need to modify getEventsAfter to support org-wide queries
							// For now, let's query via listEventsByOrg for events after lastCheck

							// Import the function we need
							const { listEventsByOrg } = await import('$lib/features/events/server');

							// Get recent events (last minute to be safe with polling)
							const result = await listEventsByOrg(orgId, { page: 1, limit: 100 });

							// Filter to only events newer than lastCheck
							const events = result.items.filter(
								(event) => event.createdAt.getTime() > lastCheck.getTime()
							);

							// Send each new event to client
							for (const event of events) {
								if (!isActive) break;

								const message = `data: ${JSON.stringify({
									type: 'event',
									data: {
										id: event.id,
										channelId: event.channelId,
										projectId: event.projectId,
										organizationId: event.organizationId,
										title: event.title,
										description: event.description,
										icon: event.icon,
										tags: event.tags,
										metadata: event.metadata,
										userId: event.userId,
										notify: event.notify,
										source: event.source,
										createdAt: event.createdAt.toISOString()
									}
								})}\n\n`;

								try {
									controller.enqueue(encoder.encode(message));
								} catch {
									// Controller closed, stop polling
									isActive = false;
									break;
								}
							}

							// Update last check time
							lastCheck = new Date();

							// Send heartbeat to keep connection alive
							if (isActive) {
								try {
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
									);
								} catch {
									isActive = false;
									break;
								}
							}

							// Wait before next poll
							await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
						} catch (error) {
							logger.error('Error polling org events', error instanceof Error ? error : undefined, {
								organizationId: orgId
							});
							// Continue polling despite errors
							await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
						}
					}
				};

				// Start polling
				poll();

				// Cleanup function
				return () => {
					isActive = false;
				};
			},
			cancel() {
				// Stream was cancelled by client
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no' // Disable nginx buffering
			}
		});
	} catch (error) {
		logger.error('Error streaming org events', error instanceof Error ? error : undefined, {
			organizationId: locals.authContext?.organizationId
		});
		return new Response('Internal server error', { status: 500 });
	}
};
