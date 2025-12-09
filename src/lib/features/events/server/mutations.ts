import type { EventInsert, Event } from '$lib/server/db/schema';
import { createEvent } from './tinybird.service';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createContextLogger } from '$lib/server/logger';
import {
	invalidateChannelCache,
	invalidateOrganizationCache,
	publishToChannel
} from '$lib/server/cache';
import { waitUntil } from '$lib/server/wait-until';
import { triggerWorkflow } from '$lib/server/workflow';

const logger = createContextLogger('events');

export async function createAndBroadcastEvent(event: EventInsert): Promise<Event> {
	// Fetch channel with folder information
	const channel = await db.query.channel.findFirst({
		where: eq(schema.channel.id, event.channelId),
		columns: { id: true, projectId: true }
	});

	if (!channel) {
		throw new Error(`Channel ${event.channelId} not found`);
	}

	const projectId = channel.projectId;

	// 1. Create the event in Tinybird
	const createdEvent = await createEvent(event, projectId ?? undefined, false);

	// 2. Fire-and-forget non-critical side effects
	waitUntil(
		Promise.all([
			invalidateChannelCache(event.channelId),
			invalidateOrganizationCache(event.organizationId),
			publishToChannel(`events:channel:${event.channelId}`, {
				type: 'event',
				data: createdEvent
			})
		]).catch((error) => {
			logger.error('Non-critical side effects failed', error instanceof Error ? error : undefined, {
				eventId: createdEvent.id,
				channelId: event.channelId
			});
		})
	);

	// 3. Trigger Upstash Workflow for critical side effects
	triggerWorkflow('/api/workflows/events', {
		eventId: createdEvent.id,
		channelId: createdEvent.channelId,
		organizationId: createdEvent.organizationId,
		projectId: projectId ?? null,
		notify: event.notify ?? true,
		eventType: event.title, // Use title as event type for now
		tags: event.tags || []
	}).catch((error) => {
		// Log but don't fail the request - workflow will retry automatically
		logger.error('Failed to trigger event workflow', error instanceof Error ? error : undefined, {
			eventId: createdEvent.id,
			channelId: event.channelId
		});
	});

	return createdEvent;
}
