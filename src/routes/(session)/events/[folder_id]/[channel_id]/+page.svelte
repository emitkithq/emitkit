<script lang="ts">
	import { now, parseAbsoluteToLocal, toCalendarDate } from '@internationalized/date';
	import type { PageProps } from './$types';
	import type { EventListItem as EventListItemType } from '$lib/features/events/types.js';
	import EventListItem from '$lib/features/events/components/event-list-item.svelte';
	import { Wrapper } from '$lib/components/ui/wrapper';
	import { getEventsListQuery } from '$lib/features/events/events.remote';

	let { params, data }: PageProps = $props();

	// Make query reactive to params changes
	let query = $state<Awaited<ReturnType<typeof getEventsListQuery>> | null>(null);
	let isLoading = $state(true);

	// Fetch events when params change
	$effect(() => {
		const currentChannelId = params.channel_id;
		const currentOrgId = data.orgId;

		if (currentChannelId && currentOrgId) {
			isLoading = true;
			loadedEventIds.clear();
			allEvents = [];

			getEventsListQuery({
				channelId: currentChannelId,
				organizationId: currentOrgId,
				limit: 20,
				page: 1
			})
				.then((result) => {
					query = result;
					loadedEventIds = new Set(result.items.map((event) => event.id));
					allEvents = result.items;
					isLoading = false;
				})
				.catch((error) => {
					console.error('Failed to load events:', error);
					isLoading = false;
				});
		}
	});

	// Track which events are "new" (streamed in after page load)
	type EventWithNewStatus = EventListItemType & {
		isNew?: boolean;
		streamedAt?: number; // Timestamp when event was streamed in
	};

	type TimeGroup =
		| 'new'
		| 'last_hour'
		| 'earlier_today'
		| 'yesterday'
		| 'last_7_days'
		| 'last_30_days'
		| 'older';

	type GroupedEvents = {
		group: TimeGroup;
		label: string;
		events: EventWithNewStatus[];
	};

	// Track loaded event IDs to prevent duplicates
	let loadedEventIds = new Set<string>();

	// Initialize with server-loaded events (not marked as new)
	let allEvents = $state<EventWithNewStatus[]>([]);

	// Handle event deletion
	function handleEventDeleted(eventId: string) {
		// Remove event from the list
		allEvents = allEvents.filter((event) => event.id !== eventId);
		loadedEventIds.delete(eventId);
	}

	// Track mount time to determine which events are truly new
	let mountTime = 0;

	/**
	 * Determine which time group an event belongs to
	 */
	function getTimeGroup(event: EventWithNewStatus, currentTime: Date): TimeGroup {
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
	function getGroupLabel(group: TimeGroup): string {
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
	 * Group events by time periods
	 */
	const groupedEvents = $derived.by((): GroupedEvents[] => {
		const currentTime = new Date();
		const groups = new Map<TimeGroup, EventWithNewStatus[]>();

		// Initialize all groups in order
		const groupOrder: TimeGroup[] = [
			'new',
			'last_hour',
			'earlier_today',
			'yesterday',
			'last_7_days',
			'last_30_days',
			'older'
		];
		groupOrder.forEach((g) => groups.set(g, []));

		// Assign events to groups
		allEvents.forEach((event) => {
			const group = getTimeGroup(event, currentTime);
			groups.get(group)!.push(event);
		});

		// Convert to array, preserving order, only including non-empty groups
		return groupOrder
			.map((group) => ({
				group,
				label: getGroupLabel(group),
				events: groups.get(group)!
			}))
			.filter((g) => g.events.length > 0);
	});

	// Setup SSE connection reactively when params change
	$effect(() => {
		const currentFolderId = params.folder_id;
		const currentChannelId = params.channel_id;

		if (!currentFolderId || !currentChannelId) return;

		mountTime = Date.now();

		const eventSource = new EventSource(`/events/${currentFolderId}/${currentChannelId}/stream`);

		eventSource.addEventListener('message', async (e) => {
			const message = JSON.parse(e.data);

			if (message.type === 'event' && message.data) {
				// Convert createdAt string to Date object
				const eventData = message.data;
				const streamedAt = Date.now();
				const event: EventWithNewStatus = {
					...eventData,
					createdAt: new Date(eventData.createdAt),
					isNew: true, // Mark as new since it's streaming in real-time
					streamedAt
				};

				// Only add if we haven't seen this event before
				if (!loadedEventIds.has(event.id)) {
					loadedEventIds.add(event.id);
					allEvents = [event, ...allEvents]; // Prepend new events to the top
				}
			}
		});

		// Auto-remove "new" indicator after 30 seconds
		const interval = setInterval(() => {
			const currentTime = Date.now();
			const thirtySecondsAgo = currentTime - 30000;

			allEvents = allEvents.map((event) => {
				if (event.isNew && event.streamedAt && event.streamedAt < thirtySecondsAgo) {
					return { ...event, isNew: false };
				}
				return event;
			});
		}, 5000); // Check every 5 seconds

		// Cleanup when params change or component unmounts
		return () => {
			eventSource.close();
			clearInterval(interval);
		};
	});
</script>

<Wrapper alignment="center">
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="flex flex-col items-center gap-3">
				<div
					class="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
				></div>
				<p class="text-sm text-muted-foreground">Loading events...</p>
			</div>
		</div>
	{:else if allEvents.length === 0}
		<p class="text-muted-foreground">Waiting for events...</p>
	{:else}
		<div class="flex w-full max-w-lg flex-col gap-6 overflow-y-auto">
			{#each groupedEvents as group (group.group)}
				<!-- Group header -->
				<div class="flex flex-col gap-3">
					<h3 class="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						{group.label}
						<span class="ml-1.5 text-[10px] font-normal">({group.events.length})</span>
					</h3>

					<!-- Events in this group -->
					<div class="flex flex-col gap-3">
						{#each group.events as event (event.id)}
							<EventListItem
								{event}
								isNew={event.isNew ?? false}
								channelId={params.channel_id}
								organizationId={data.orgId}
								onDeleted={() => handleEventDeleted(event.id)}
							/>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Wrapper>
