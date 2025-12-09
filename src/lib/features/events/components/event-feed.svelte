<script lang="ts">
	import type { PaginatedResult } from '$lib/features/events/types';
	import type { Event } from '$lib/server/db/schema';
	import type { Project } from '$lib/features/projects/types';
	import type { Channel } from '$lib/features/channels/types';
	import EventListItem from '$lib/features/events/components/event-list-item.svelte';
	import { Wrapper } from '$lib/components/ui/wrapper';
	import {
		getTimeGroup,
		getGroupLabel,
		TIME_GROUP_ORDER,
		type EventWithNewStatus,
		type GroupedEvents
	} from '$lib/features/events/utils/time-grouping';

	let {
		organizationId,
		initialEvents,
		sites,
		channels,
		channelId,
		projectId,
		showChannelContext = false
	}: {
		organizationId: string;
		initialEvents: PaginatedResult<Event>;
		sites: Project[];
		channels: Channel[];
		channelId?: string;
		projectId?: string;
		showChannelContext?: boolean;
	} = $props();

	// Track loaded event IDs to prevent duplicates
	let loadedEventIds = $state(new Set<string>());

	// Initialize with server-loaded events (not marked as new)
	let allEvents = $state<EventWithNewStatus[]>([]);

	// React to initialEvents prop changes (when navigating or filtering)
	$effect(() => {
		if (initialEvents && initialEvents.items) {
			loadedEventIds = new Set(initialEvents.items.map((event) => event.id));
			allEvents = initialEvents.items;
		}
	});

	// Create maps for channel and project lookups (reactive to prop changes)
	const projectMap = $derived(new Map(sites.map((project) => [project.id, project])));
	const channelMap = $derived(new Map(channels.map((channel) => [channel.id, channel])));

	// Handle event deletion
	function handleEventDeleted(eventId: string) {
		allEvents = allEvents.filter((event) => event.id !== eventId);
		loadedEventIds.delete(eventId);
	}

	/**
	 * Group events by time periods
	 */
	const groupedEvents = $derived.by((): GroupedEvents[] => {
		const currentTime = new Date();
		const groups = new Map<string, EventWithNewStatus[]>();

		// Initialize all groups in order
		TIME_GROUP_ORDER.forEach((g) => groups.set(g, []));

		// Assign events to groups
		allEvents.forEach((event) => {
			const group = getTimeGroup(event, currentTime);
			groups.get(group)!.push(event);
		});

		// Convert to array, preserving order, only including non-empty groups
		return TIME_GROUP_ORDER.map((group) => ({
			group,
			label: getGroupLabel(group),
			events: groups.get(group)!
		})).filter((g) => g.events.length > 0);
	});

	// Setup SSE connection reactively when props change
	$effect(() => {
		// Determine SSE endpoint based on whether we're in channel-specific view
		const sseEndpoint =
			channelId && projectId ? `/events/${projectId}/${channelId}/stream` : `/stream`;

		const eventSource = new EventSource(sseEndpoint);

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

		// Cleanup when props change or component unmounts
		return () => {
			eventSource.close();
			clearInterval(interval);
		};
	});
</script>

<Wrapper alignment="center">
	{#if allEvents.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 py-12 text-center">
			<div class="rounded-full bg-muted p-6">
				<svg
					class="size-12 text-muted-foreground"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
					/>
				</svg>
			</div>
			<div class="space-y-2">
				<h3 class="text-lg font-semibold">No events yet</h3>
				<p class="text-sm text-muted-foreground">
					{#if channelId}
						Waiting for events in this channel...
					{:else}
						Start sending events from your applications to see them here
					{/if}
				</p>
			</div>
		</div>
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
							{@const project = projectMap.get(event.projectId)}
							{@const channel = channelMap.get(event.channelId)}
							<EventListItem
								{event}
								isNew={event.isNew ?? false}
								channelId={event.channelId}
								{organizationId}
								onDeleted={() => handleEventDeleted(event.id)}
								projectName={project?.name}
								projectSlug={project?.slug}
								channelName={channel?.name}
								{showChannelContext}
							/>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Wrapper>
