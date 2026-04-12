import type { EventInsert, Event } from '$lib/server/db/schema';
import { createEvent } from './repository';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createContextLogger } from '$lib/server/logger';
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

	// 1. Create the event in Postgres
	const createdEvent = await createEvent(event, projectId ?? undefined);

	// 2. Trigger Upstash Workflow for critical side effects (push notifications, webhooks, integrations)
	triggerWorkflow('/api/workflows/events', {
		eventId: createdEvent.id,
		channelId: createdEvent.channelId,
		organizationId: createdEvent.organizationId,
		projectId: projectId ?? null,
		notify: event.notify ?? true,
		eventType: event.title,
		tags: event.tags || []
	}).catch((error) => {
		logger.error('Failed to trigger event workflow', error instanceof Error ? error : undefined, {
			eventId: createdEvent.id,
			channelId: event.channelId
		});
	});

	return createdEvent;
}
