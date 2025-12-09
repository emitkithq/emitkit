<script lang="ts">
	import MessageSquareIcon from '@lucide/svelte/icons/bell';
	import type { EventListItem } from '$lib/features/events/types.js';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import HashIcon from '@lucide/svelte/icons/hash';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { cn } from '$lib/utils/ui.js';
	import { motion } from '$lib/utils/motion.js';
	import EventListItemMetadata from './event-list-item-metadata.svelte';
	import { deleteEventCommand } from '$lib/features/events/events.remote';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let {
		event,
		isNew = false,
		channelId,
		organizationId,
		onDeleted,
		projectName,
		channelName,
		showChannelContext = false
	}: {
		event: EventListItem;
		isNew?: boolean;
		channelId: string;
		organizationId: string;
		onDeleted?: () => void;
		projectName?: string;
		channelName?: string;
		showChannelContext?: boolean;
	} = $props();

	let isFooterExpanded = $state(false);
	let isDescriptionExpanded = $state(false);
	const hasMetadata = $derived(event.metadata && Object.keys(event.metadata).length > 0);
	const descriptionTruncateLength = 60;
	let scopeMenuOpen = $state(false);

	// Delete confirmation state
	let deleteConfirmState = $state<'idle' | 'confirming'>('idle');
	let confirmTimer: ReturnType<typeof setTimeout> | null = null;

	// Handle first delete click - enter confirming state
	function handleDeleteClick() {
		deleteConfirmState = 'confirming';

		// Auto-reset after 3 seconds
		if (confirmTimer) clearTimeout(confirmTimer);
		confirmTimer = setTimeout(() => {
			deleteConfirmState = 'idle';
		}, 3000);
	}

	// Handle confirmed delete - actually delete the event
	async function handleConfirmDelete() {
		if (confirmTimer) clearTimeout(confirmTimer);

		try {
			await deleteEventCommand({
				eventId: event.id,
				channelId,
				organizationId
			});

			// Reset state first
			deleteConfirmState = 'idle';

			// Close dropdown
			scopeMenuOpen = false;

			// Show success toast
			toast.success('Event deleted', {
				description: 'The event has been permanently deleted.'
			});

			// Notify parent to refresh list
			onDeleted?.();
		} catch (error) {
			console.error('Failed to delete event:', error);
			deleteConfirmState = 'idle';

			// Show error toast
			toast.error('Failed to delete event', {
				description: error instanceof Error ? error.message : 'An unexpected error occurred.'
			});
		}
	}

	// Cleanup timer on unmount
	$effect(() => {
		return () => {
			if (confirmTimer) clearTimeout(confirmTimer);
		};
	});

	// Navigate to channel view
	function handleNavigateToChannel() {
		if (event.projectId && event.channelId) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(`/events/${event.projectId}/${event.channelId}`);
		}
	}
</script>

<div
	class={cn(
		'flex flex-col overflow-hidden rounded-md border text-sm transition-all duration-700 ease-out outline-none',
		isNew ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-border bg-transparent'
	)}
>
	<!-- Header with icon, content, and actions -->
	<div class="flex items-center gap-4 p-4">
		<!-- Icon -->
		<div
			class="flex size-8 shrink-0 items-center justify-center rounded-sm border bg-muted [&_svg]:size-4"
		>
			<MessageSquareIcon />
		</div>

		<!-- Content -->
		<div class="flex flex-1 flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="text-sm leading-snug font-medium">
					{event.title}
				</span>
				{#if isNew}
					<Badge
						variant="default"
						class="h-5 px-1.5 text-[10px] font-semibold tracking-wider uppercase transition-all duration-500"
					>
						New
					</Badge>
				{/if}
			</div>

			{#if showChannelContext && (projectName || channelName)}
				<button
					onclick={handleNavigateToChannel}
					class="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
					type="button"
				>
					<HashIcon class="size-3" />
					<span>
						{#if projectName && channelName}
							{projectName} / {channelName}
						{:else if projectName}
							{projectName}
						{:else if channelName}
							{channelName}
						{/if}
					</span>
				</button>
			{/if}
			{#if event.description}
				{#if event.description.length > descriptionTruncateLength && !isDescriptionExpanded}
					<p class="text-xs text-muted-foreground">
						{event.description.slice(0, descriptionTruncateLength)}...
						<button
							onclick={() => (isDescriptionExpanded = true)}
							class="ml-1 font-medium hover:underline"
							type="button"
						>
							more
						</button>
					</p>
				{:else}
					<p class="text-xs whitespace-pre-wrap text-muted-foreground">
						{event.description}
						{#if event.description.length > descriptionTruncateLength}
							<button
								onclick={() => (isDescriptionExpanded = false)}
								class="ml-1 font-medium text-primary hover:underline"
								type="button"
							>
								less
							</button>
						{/if}
					</p>
				{/if}
			{/if}
		</div>

		<!-- Actions -->
		<div class="-mr-3 flex items-center gap-2">
			<DropdownMenu.Root bind:open={scopeMenuOpen}>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="sm" variant="ghost" class="-mt-4.5 hover:bg-transparent">
							<EllipsisVerticalIcon />
							<span class="sr-only"> Actions </span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>

				<DropdownMenu.Content side="top" align="end">
					{#if deleteConfirmState === 'idle'}
						<DropdownMenu.Item
							onSelect={(e) => {
								e.preventDefault();
								handleDeleteClick();
							}}
							class="text-destructive focus:text-destructive"
						>
							<Trash2Icon class="size-4" />
							<span>Delete</span>
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item
							onSelect={() => {
								handleConfirmDelete();
							}}
							class="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive focus:bg-destructive/20 focus:text-destructive"
						>
							<AlertTriangleIcon class="size-4" />
							<span class="font-semibold">Really delete?</span>
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<!-- Footer with full-width border - only shown if metadata exists -->
	{#if hasMetadata}
		<div class="border-t">
			<!-- Clickable header to toggle metadata -->
			<button
				class={cn(
					'flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-muted/50',
					isFooterExpanded ? 'bg-muted/50' : 'bg-transparent'
				)}
				onclick={() => (isFooterExpanded = !isFooterExpanded)}
			>
				<span class="text-sm font-medium"> Details </span>
				<ChevronDownIcon
					class={cn('size-3.5 transition-transform duration-200', {
						'rotate-180': isFooterExpanded,
						'rotate-0': !isFooterExpanded
					})}
				/>
			</button>

			<!-- Expandable metadata content -->
			{#if isFooterExpanded}
				<div
					use:motion={{
						keyframes: {
							opacity: [0, 1],
							y: [-8, 0]
						},
						options: {
							duration: 0.3,
							ease: [0.22, 0.61, 0.36, 1]
						}
					}}
					class="bg-muted/30 px-4 py-3"
				>
					<EventListItemMetadata metadata={event.metadata} />
				</div>
			{/if}
		</div>
	{/if}
</div>
