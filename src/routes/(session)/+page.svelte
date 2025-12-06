<script lang="ts">
	import type { PageProps } from './$types';
	import GettingStarted from '$lib/components/onboarding/getting-started.svelte';
	import UnifiedEventFeed from '$lib/features/events/components/unified-event-feed.svelte';

	let { data }: PageProps = $props();

	const defaultSite = $derived(
		data.folders.find((folder) => folder.slug === 'default') || data.folders[0] || null
	);

	const hasEvents = $derived(data.events && data.events.items.length > 0);
</script>

<div class="container mx-auto p-6">
	<div class="mx-auto max-w-3xl">
		<!-- Hero Section -->
		<div class="mb-8 space-y-2">
			<h1 class="text-2xl font-bold tracking-tight">
				{#if hasEvents}
					Your Feed
				{:else}
					Welcome to EmitKit
				{/if}
			</h1>
			<p class="text-lg text-muted-foreground">
				{#if hasEvents}
					Real-time events from all your applications in one place.
				{:else}
					Send real-time events from all your applications in one place.
				{/if}
			</p>
		</div>

		{#if hasEvents && data.orgId}
			<!-- Unified Event Feed -->
			<div class="mb-8">
				<UnifiedEventFeed
					initialEvents={data.events}
					sites={data.folders}
					channels={data.channels}
					organizationId={data.orgId}
				/>
			</div>

			<!-- Quick Stats -->
			{#if data.folders.length > 0}
				<div class="mt-8 grid gap-4 md:grid-cols-3">
					<div class="rounded-lg border p-4">
						<div class="text-2xl font-bold">{data.folders.length}</div>
						<div class="text-sm text-muted-foreground">Folders</div>
					</div>
					<div class="rounded-lg border p-4">
						<div class="text-2xl font-bold">{data.channels.length}</div>
						<div class="text-sm text-muted-foreground">Channels</div>
					</div>
					<div class="rounded-lg border p-4">
						<div class="text-2xl font-bold">{data.events.metadata.total}</div>
						<div class="text-sm text-muted-foreground">Total Events</div>
					</div>
				</div>
			{/if}
		{:else}
			<!-- Onboarding - only show when no events exist -->
			<GettingStarted {defaultSite} />
		{/if}
	</div>
</div>
