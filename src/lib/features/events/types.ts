import type { Event as DbEvent } from '$lib/server/db/schema';

export type { Event, EventInsert } from '$lib/server/db/schema';
export type {
	PaginatedQueryResult as PaginatedResult,
	PaginationParams
} from '$lib/server/db/utils';

// EventListItem extends the base Event type to avoid DOM Event naming conflicts
// Uses a local import to ensure proper type resolution
export type EventListItem = DbEvent;

// CreateEventData is for mutations (optional fields for API)
export type CreateEventData = {
	channelId: string;
	organizationId: string;
	title: string;
	description?: string | null;
	icon?: string | null;
	tags?: string[];
	metadata?: Record<string, unknown>;
	userId?: string | null;
	notify?: boolean;
	source?: 'api' | 'webhook' | 'command';
};
