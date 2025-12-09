import { tinybird, type TinybirdEvent } from '$lib/server/tinybird';
import type { Event, EventInsert } from '$lib/server/db/schema';
import { createBetterAuthId } from '$lib/server/db/schema/utils';
import type { PaginatedResult, PaginationParams } from '../types';
import { db, schema } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { withCache, generateCacheKey } from '$lib/server/cache';

const logger = createLogger('tinybird-events');

// Cache TTL configurations (in seconds)
const CACHE_TTL = {
	LIST_EVENTS: 60, // 1 minute for paginated lists
	REALTIME_EVENTS: 3, // 3 seconds for SSE polling
	EVENT_STATS: 300 // 5 minutes for dashboard stats
} as const;

// Format a Date object for ClickHouse DateTime/DateTime64
// Converts ISO format to 'YYYY-MM-DD HH:MM:SS.SSS'
function formatDateForTinybird(date: Date): string {
	return date.toISOString().replace('T', ' ').replace('Z', '');
}

// Convert EventInsert (Drizzle schema) to TinybirdEvent
// Note: Requires projectId to be passed in or fetched from channel
// Note: Fetches organization's retention_tier for event-time retention snapshot
async function eventInsertToTinybird(
	event: EventInsert,
	projectId?: string
): Promise<TinybirdEvent> {
	// If projectId not provided, fetch from channel
	let resolvedProjectId = projectId;
	if (!resolvedProjectId) {
		const channel = await db.query.channel.findFirst({
			where: eq(schema.channel.id, event.channelId)
		});
		resolvedProjectId = channel?.projectId || '';
	}

	// Fetch organization's retention tier for event-time snapshot
	const org = await db.query.organization.findFirst({
		where: eq(schema.organization.id, event.organizationId),
		columns: { retentionTier: true }
	});

	if (!org) {
		throw new Error(`Organization ${event.organizationId} not found`);
	}

	return {
		id: event.id || createBetterAuthId('event'),
		channel_id: event.channelId,
		project_id: resolvedProjectId,
		organization_id: event.organizationId,
		retention_tier: org.retentionTier, // Snapshot tier at event creation
		title: event.title,
		description: event.description || '',
		icon: event.icon || '',
		tags: event.tags || [],
		metadata: event.metadata || {},
		user_id: event.userId || '',
		notify: event.notify ?? true,
		display_as: 'card', // Default display mode for events
		source: event.source || 'api',
		created_at: (event.createdAt || new Date()).toISOString()
	};
}

/**
 * Converts a Tinybird event record to our Event schema
 */
function tinybirdToEvent(tb: Record<string, unknown>): Event {
	// Parse tags - Tinybird returns JSON as string
	let tags: string[] = [];
	if (tb.tags) {
		if (typeof tb.tags === 'string') {
			try {
				tags = JSON.parse(tb.tags);
			} catch {
				logger.warn('Failed to parse tags JSON', { tags: tb.tags, eventId: tb.id });
			}
		} else if (Array.isArray(tb.tags)) {
			tags = tb.tags;
		}
	}

	// Parse metadata - Tinybird returns JSON as string
	let metadata: Record<string, unknown> = {};
	if (tb.metadata) {
		if (typeof tb.metadata === 'string') {
			try {
				metadata = JSON.parse(tb.metadata);
			} catch {
				logger.warn('Failed to parse metadata JSON', { metadata: tb.metadata, eventId: tb.id });
			}
		} else if (typeof tb.metadata === 'object' && tb.metadata !== null) {
			metadata = tb.metadata as Record<string, unknown>;
		}
	}

	return {
		id: String(tb.id),
		channelId: String(tb.channel_id),
		projectId: String(tb.project_id),
		organizationId: String(tb.organization_id),
		title: String(tb.title),
		description: tb.description ? String(tb.description) : null,
		icon: tb.icon ? String(tb.icon) : null,
		tags,
		metadata,
		userId: tb.user_id ? String(tb.user_id) : null,
		notify: Boolean(tb.notify),
		source: String(tb.source || 'api'),
		createdAt: new Date(String(tb.created_at))
	};
}

export async function createEvent(
	event: EventInsert,
	projectId?: string,
	wait: boolean = false
): Promise<Event> {
	const tinybirdEvent = await eventInsertToTinybird(event, projectId);

	// Ingest to Tinybird
	const result = await tinybird.ingestEvent(tinybirdEvent, wait);

	if (result.successful_rows === 0) {
		const error = new Error(
			`Failed to ingest event to Tinybird. Quarantined: ${result.quarantined_rows}`
		);
		logger.error('Event ingestion to Tinybird failed', error, {
			eventId: tinybirdEvent.id,
			channelId: tinybirdEvent.channel_id,
			organizationId: tinybirdEvent.organization_id,
			quarantinedRows: result.quarantined_rows
		});
		throw error;
	}

	logger.info('Event ingested to Tinybird', {
		id: tinybirdEvent.id,
		channelId: tinybirdEvent.channel_id,
		projectId: tinybirdEvent.project_id,
		organizationId: tinybirdEvent.organization_id,
		title: tinybirdEvent.title,
		source: tinybirdEvent.source,
		waited: wait
	});

	// Return the event in Drizzle schema format
	return {
		id: tinybirdEvent.id,
		channelId: tinybirdEvent.channel_id,
		projectId: tinybirdEvent.project_id,
		organizationId: tinybirdEvent.organization_id,
		title: tinybirdEvent.title,
		description: tinybirdEvent.description || null,
		icon: tinybirdEvent.icon || null,
		tags: tinybirdEvent.tags,
		metadata: tinybirdEvent.metadata,
		userId: tinybirdEvent.user_id || null,
		notify: tinybirdEvent.notify,
		source: tinybirdEvent.source,
		createdAt: new Date(tinybirdEvent.created_at)
	};
}

export async function createEventBatch(
	events: EventInsert[],
	wait: boolean = false
): Promise<{ successful_rows: number; quarantined_rows: number }> {
	// Optimize: Batch-fetch all unique channel projectIds and org tiers at once to avoid N+1 queries
	const uniqueChannelIds = [...new Set(events.map((e) => e.channelId))];
	const uniqueOrgIds = [...new Set(events.map((e) => e.organizationId))];

	// Fetch all channels in a single query
	const channels = await db.query.channel.findMany({
		where: inArray(schema.channel.id, uniqueChannelIds),
		columns: { id: true, projectId: true }
	});

	// Fetch all organizations in a single query
	const orgs = await db.query.organization.findMany({
		where: inArray(schema.organization.id, uniqueOrgIds),
		columns: { id: true, retentionTier: true }
	});

	// Create maps for O(1) lookups
	const channelProjectMap = new Map(channels.map((c) => [c.id, c.projectId]));
	const orgTierMap = new Map(orgs.map((o) => [o.id, o.retentionTier]));

	// Convert all events with pre-fetched projectIds and retention tiers
	const tinybirdEvents = events.map((e) => {
		const projectId = channelProjectMap.get(e.channelId) || '';
		const retentionTier = orgTierMap.get(e.organizationId);

		if (!retentionTier) {
			throw new Error(`Organization ${e.organizationId} not found`);
		}

		return {
			id: e.id || createBetterAuthId('event'),
			channel_id: e.channelId,
			project_id: projectId,
			organization_id: e.organizationId,
			retention_tier: retentionTier,
			title: e.title,
			description: e.description || '',
			icon: e.icon || '',
			tags: e.tags || [],
			metadata: e.metadata || {},
			user_id: e.userId || '',
			notify: e.notify ?? true,
			display_as: 'card', // Default display mode for events
			source: e.source || 'api',
			created_at: (e.createdAt || new Date()).toISOString()
		};
	});

	const result = await tinybird.ingestEventBatch(tinybirdEvents, wait);

	logger.info('Event batch ingested to Tinybird', {
		totalEvents: events.length,
		successfulRows: result.successful_rows,
		quarantinedRows: result.quarantined_rows,
		waited: wait
	});

	if (result.quarantined_rows > 0) {
		logger.warn('Some events quarantined during batch ingestion', {
			totalEvents: events.length,
			quarantinedRows: result.quarantined_rows
		});
	}

	return result;
}

export async function listEvents(
	channelId: string,
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedResult<Event>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	interface TinybirdPaginatedResponse {
		data: Record<string, unknown>[];
		meta: {
			total?: number;
		};
	}

	// Generate cache key
	const cacheKey = generateCacheKey('events:channel', {
		channelId,
		orgId,
		page,
		limit
	});

	// Wrap query with cache
	return withCache(cacheKey, CACHE_TTL.LIST_EVENTS, async () => {
		// Query the get_events_paginated pipe
		const response = await tinybird.queryPipe<TinybirdPaginatedResponse>('get_events_paginated', {
			channel_id: channelId,
			organization_id: orgId,
			limit,
			offset
		});

		const items = response.data.map(tinybirdToEvent);
		const total = response.meta?.total || items.length;
		const totalPages = Math.ceil(total / limit);

		logger.info('Events listed from Tinybird', {
			channelId,
			organizationId: orgId,
			page,
			limit,
			total,
			returned: items.length
		});

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
	});
}

export async function listEventsByOrg(
	orgId: string,
	pagination?: PaginationParams,
	projectId?: string
): Promise<PaginatedResult<Event>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	interface TinybirdPaginatedResponse {
		data: Record<string, unknown>[];
		meta: {
			total?: number;
		};
	}

	// Generate cache key (include projectId to ensure different cache entries)
	const cacheKey = generateCacheKey('events:org', {
		orgId,
		projectId: projectId || 'all',
		page,
		limit
	});

	// Wrap query with cache
	return withCache(cacheKey, CACHE_TTL.LIST_EVENTS, async () => {
		// Query the get_events_paginated pipe with optional project filter
		const params: Record<string, string | number> = {
			organization_id: orgId,
			limit,
			offset
		};

		// Add project_id filter if provided
		if (projectId) {
			params.project_id = projectId;
		}

		const response = await tinybird.queryPipe<TinybirdPaginatedResponse>(
			'get_events_paginated',
			params
		);

		const items = response.data.map(tinybirdToEvent);
		const total = response.meta?.total || items.length;
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
	});
}

export async function getEventsAfter(
	channelId: string,
	afterTimestamp: Date,
	orgId: string,
	limit = 100
): Promise<Event[]> {
	interface TinybirdStreamResponse {
		data: Record<string, unknown>[];
	}

	// Generate cache key with timestamp truncated to 3-second buckets
	// This ensures all requests within a 3-second window hit the same cache
	const timestampBucket = Math.floor(afterTimestamp.getTime() / 3000) * 3000;
	const cacheKey = generateCacheKey('events:realtime', {
		channelId,
		orgId,
		since: timestampBucket,
		limit
	});

	// Wrap query with cache
	return withCache(cacheKey, CACHE_TTL.REALTIME_EVENTS, async () => {
		// Query the stream_events pipe
		const response = await tinybird.queryPipe<TinybirdStreamResponse>('stream_events', {
			channel_id: channelId,
			organization_id: orgId,
			since: formatDateForTinybird(afterTimestamp),
			limit
		});

		const events = response.data.map(tinybirdToEvent);

		logger.info('Events streamed from Tinybird', {
			channelId,
			organizationId: orgId,
			since: afterTimestamp.toISOString(),
			limit,
			returned: events.length
		});

		return events;
	});
}

export async function getEventById(eventId: string): Promise<Event | null> {
	interface TinybirdEventResponse {
		data: Record<string, unknown>[];
	}

	const response = await tinybird.queryPipe<TinybirdEventResponse>('get_event_by_id', {
		event_id: eventId
	});

	if (!response.data || response.data.length === 0) {
		logger.warn('Event not found in Tinybird', { eventId });
		return null;
	}

	const event = tinybirdToEvent(response.data[0]);

	logger.info('Event fetched from Tinybird', {
		eventId,
		channelId: event.channelId,
		organizationId: event.organizationId
	});

	return event;
}

export async function getEventStats(
	orgId: string,
	channelId?: string,
	dateFrom?: Date,
	dateTo?: Date
): Promise<{
	total_events: number;
	unique_users: number;
	tags_distribution: Record<string, number>;
}> {
	interface TinybirdStatsResponse {
		data: Array<{
			total_events: number;
			unique_users: number;
			tags_distribution: Record<string, number>;
		}>;
	}

	// Generate cache key
	const cacheKey = generateCacheKey('events:stats', {
		orgId,
		channelId: channelId || 'all',
		dateFrom: dateFrom?.getTime() || 'none',
		dateTo: dateTo?.getTime() || 'none'
	});

	// Wrap query with cache
	return withCache(cacheKey, CACHE_TTL.EVENT_STATS, async () => {
		const params: Record<string, string> = {
			organization_id: orgId
		};

		if (channelId) params.channel_id = channelId;
		if (dateFrom) params.date_from = formatDateForTinybird(dateFrom);
		if (dateTo) params.date_to = formatDateForTinybird(dateTo);

		const response = await tinybird.queryPipe<TinybirdStatsResponse>('get_events_stats', params);

		const stats = response.data[0] || {
			total_events: 0,
			unique_users: 0,
			tags_distribution: {}
		};

		logger.info('Event stats fetched from Tinybird', {
			organizationId: orgId,
			channelId,
			dateFrom: dateFrom?.toISOString(),
			dateTo: dateTo?.toISOString(),
			totalEvents: stats.total_events,
			uniqueUsers: stats.unique_users
		});

		return stats;
	});
}

/**
 * Delete an event from Tinybird
 *
 * Uses the Data Sources API delete endpoint for permanent deletion in ClickHouse.
 * Includes ownership verification to ensure user can only delete events they have access to.
 *
 * @param eventId - ID of the event to delete
 * @param channelId - Channel ID for ownership verification
 * @param orgId - Organization ID for ownership verification
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteEvent(
	eventId: string,
	channelId: string,
	orgId: string
): Promise<void> {
	const operation = logger.start('Delete event from Tinybird', {
		eventId,
		channelId,
		organizationId: orgId
	});

	try {
		// Build DELETE condition with ownership checks
		const deleteCondition = `id = '${eventId}' AND channel_id = '${channelId}' AND organization_id = '${orgId}'`;

		await tinybird.deleteData('events', deleteCondition);

		operation.end({ eventId, channelId, organizationId: orgId });

		logger.success('Event deleted from Tinybird', {
			eventId,
			channelId,
			organizationId: orgId
		});
	} catch (error) {
		operation.error('Failed to delete event', error instanceof Error ? error : undefined, {
			eventId,
			channelId,
			organizationId: orgId
		});
		throw error;
	}
}
