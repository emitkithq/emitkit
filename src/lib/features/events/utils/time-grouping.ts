import { now, parseAbsoluteToLocal, toCalendarDate } from '@internationalized/date';
import type { EventListItem } from '$lib/features/events/types';

/**
 * Event with tracking for streaming status
 */
export type EventWithNewStatus = EventListItem & {
	isNew?: boolean;
	streamedAt?: number; // Timestamp when event was streamed in
};

/**
 * Time-based grouping categories for events
 */
export type TimeGroup =
	| 'new'
	| 'last_hour'
	| 'earlier_today'
	| 'yesterday'
	| 'last_7_days'
	| 'last_30_days'
	| 'older';

/**
 * Grouped events with metadata
 */
export type GroupedEvents = {
	group: TimeGroup;
	label: string;
	events: EventWithNewStatus[];
};

/**
 * Determine which time group an event belongs to
 */
export function getTimeGroup(event: EventWithNewStatus, currentTime: Date): TimeGroup {
	// If event was streamed in and is still "new" (< 30s old)
	if (event.isNew && event.streamedAt) {
		const secondsSinceStreamed = (currentTime.getTime() - event.streamedAt) / 1000;
		if (secondsSinceStreamed < 30) {
			return 'new';
		}
	}

	const eventTime = event.createdAt.getTime();
	const currentTimeMs = currentTime.getTime();
	const diffMs = currentTimeMs - eventTime;
	const diffHours = diffMs / (1000 * 60 * 60);
	const diffDays = diffMs / (1000 * 60 * 60 * 24);

	// Last hour (< 1 hour ago)
	if (diffHours < 1) {
		return 'last_hour';
	}

	// Check if event is today
	const eventDate = toCalendarDate(parseAbsoluteToLocal(event.createdAt.toISOString()));
	const todayDate = toCalendarDate(now('UTC'));

	if (eventDate.compare(todayDate) === 0) {
		// Same day - Earlier today (> 1 hour ago)
		return 'earlier_today';
	}

	// Check if event is yesterday
	const yesterdayDate = todayDate.subtract({ days: 1 });
	if (eventDate.compare(yesterdayDate) === 0) {
		return 'yesterday';
	}

	// Last 7 days
	if (diffDays < 7) {
		return 'last_7_days';
	}

	// Last 30 days
	if (diffDays < 30) {
		return 'last_30_days';
	}

	// Older
	return 'older';
}

/**
 * Get display label for a time group
 */
export function getGroupLabel(group: TimeGroup): string {
	const labels: Record<TimeGroup, string> = {
		new: 'New',
		last_hour: 'Last hour',
		earlier_today: 'Earlier today',
		yesterday: 'Yesterday',
		last_7_days: 'Last 7 days',
		last_30_days: 'Last 30 days',
		older: 'Older'
	};
	return labels[group];
}

/**
 * Define the order in which time groups should be displayed
 */
export const TIME_GROUP_ORDER: TimeGroup[] = [
	'new',
	'last_hour',
	'earlier_today',
	'yesterday',
	'last_7_days',
	'last_30_days',
	'older'
];
