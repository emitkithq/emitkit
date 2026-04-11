import { db, schema } from '$lib/server/db';
import type { Event, EventInsert } from '$lib/server/db/schema';
import { createBetterAuthId } from '$lib/server/db/schema/utils';
import { and, eq, desc, gt, sql, inArray } from 'drizzle-orm';
import type { PaginatedResult, PaginationParams } from '../types';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('events-repository');

export async function createEvent(eventInput: EventInsert, projectId?: string): Promise<Event> {
	// If projectId not provided, fetch from channel
	let resolvedProjectId = eventInput.projectId || projectId;
	if (!resolvedProjectId) {
		const channel = await db.query.channel.findFirst({
			where: eq(schema.channel.id, eventInput.channelId)
		});
		resolvedProjectId = channel?.projectId || '';
	}

	const [created] = await db
		.insert(schema.event)
		.values({
			id: eventInput.id || createBetterAuthId('event'),
			channelId: eventInput.channelId,
			projectId: resolvedProjectId,
			organizationId: eventInput.organizationId,
			title: eventInput.title,
			description: eventInput.description ?? null,
			icon: eventInput.icon ?? null,
			tags: eventInput.tags ?? [],
			metadata: eventInput.metadata ?? {},
			userId: eventInput.userId ?? null,
			notify: eventInput.notify ?? true,
			source: eventInput.source ?? 'api',
			createdAt: eventInput.createdAt ?? new Date()
		})
		.returning();

	if (!created) throw new Error('Failed to create event');

	logger.info('Event created', {
		id: created.id,
		channelId: created.channelId,
		projectId: created.projectId,
		organizationId: created.organizationId,
		title: created.title
	});

	return created;
}

export async function createEventBatch(
	events: EventInsert[]
): Promise<{ successful_rows: number; quarantined_rows: number }> {
	if (events.length === 0) return { successful_rows: 0, quarantined_rows: 0 };

	// Batch-fetch channel projectIds for events missing them
	const channelIdsNeedingProject = [
		...new Set(events.filter((e) => !e.projectId).map((e) => e.channelId))
	];

	const channelProjectMap = new Map<string, string>();
	if (channelIdsNeedingProject.length > 0) {
		const channels = await db.query.channel.findMany({
			where: inArray(schema.channel.id, channelIdsNeedingProject),
			columns: { id: true, projectId: true }
		});
		for (const c of channels) channelProjectMap.set(c.id, c.projectId);
	}

	const rows = events.map((e) => ({
		id: e.id || createBetterAuthId('event'),
		channelId: e.channelId,
		projectId: e.projectId || channelProjectMap.get(e.channelId) || '',
		organizationId: e.organizationId,
		title: e.title,
		description: e.description ?? null,
		icon: e.icon ?? null,
		tags: e.tags ?? [],
		metadata: e.metadata ?? {},
		userId: e.userId ?? null,
		notify: e.notify ?? true,
		source: e.source ?? 'api',
		createdAt: e.createdAt ?? new Date()
	}));

	const result = await db.insert(schema.event).values(rows).returning();

	logger.info('Event batch created', {
		totalEvents: events.length,
		successfulRows: result.length
	});

	return { successful_rows: result.length, quarantined_rows: 0 };
}

export async function listEvents(
	channelId: string,
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedResult<Event>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	const where = and(eq(schema.event.channelId, channelId), eq(schema.event.organizationId, orgId));

	const [items, countResult] = await Promise.all([
		db.query.event.findMany({
			where,
			orderBy: [desc(schema.event.createdAt)],
			limit,
			offset
		}),
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.event)
			.where(where)
	]);

	const total = Number(countResult[0]?.count ?? 0);
	const totalPages = Math.ceil(total / limit);

	return {
		items,
		metadata: {
			page,
			limit,
			total,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}

export async function listEventsByOrg(
	orgId: string,
	pagination?: PaginationParams,
	projectId?: string
): Promise<PaginatedResult<Event>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	const conditions = [eq(schema.event.organizationId, orgId)];
	if (projectId) conditions.push(eq(schema.event.projectId, projectId));
	const where = and(...conditions);

	const [items, countResult] = await Promise.all([
		db.query.event.findMany({
			where,
			orderBy: [desc(schema.event.createdAt)],
			limit,
			offset
		}),
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.event)
			.where(where)
	]);

	const total = Number(countResult[0]?.count ?? 0);
	const totalPages = Math.ceil(total / limit);

	return {
		items,
		metadata: {
			page,
			limit,
			total,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}

export async function getEventsAfter(
	channelId: string,
	afterTimestamp: Date,
	orgId: string,
	limit = 100
): Promise<Event[]> {
	return await db.query.event.findMany({
		where: and(
			eq(schema.event.channelId, channelId),
			eq(schema.event.organizationId, orgId),
			gt(schema.event.createdAt, afterTimestamp)
		),
		orderBy: [desc(schema.event.createdAt)],
		limit
	});
}

export async function getEventById(eventId: string): Promise<Event | null> {
	const event = await db.query.event.findFirst({
		where: eq(schema.event.id, eventId)
	});
	return event ?? null;
}

export async function getEventStats(
	orgId: string,
	channelId?: string
): Promise<{
	total_events: number;
	unique_users: number;
	tags_distribution: Record<string, number>;
}> {
	const conditions = [eq(schema.event.organizationId, orgId)];
	if (channelId) conditions.push(eq(schema.event.channelId, channelId));
	const where = and(...conditions);

	const [countResult, usersResult] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.event)
			.where(where),
		db
			.select({ count: sql<number>`count(distinct ${schema.event.userId})` })
			.from(schema.event)
			.where(where)
	]);

	return {
		total_events: Number(countResult[0]?.count ?? 0),
		unique_users: Number(usersResult[0]?.count ?? 0),
		tags_distribution: {}
	};
}

export async function deleteEvent(
	eventId: string,
	channelId: string,
	orgId: string
): Promise<void> {
	await db
		.delete(schema.event)
		.where(
			and(
				eq(schema.event.id, eventId),
				eq(schema.event.channelId, channelId),
				eq(schema.event.organizationId, orgId)
			)
		);

	logger.info('Event deleted', { eventId, channelId, organizationId: orgId });
}

export async function hasEventsByOrg(orgId: string): Promise<boolean> {
	const result = await db
		.select({ count: sql<number>`1` })
		.from(schema.event)
		.where(eq(schema.event.organizationId, orgId))
		.limit(1);
	return result.length > 0;
}
