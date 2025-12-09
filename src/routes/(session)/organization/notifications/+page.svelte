<script lang="ts">
	import type { PageData } from './$types';
	import NotificationSettings from '$lib/features/notifications/components/notification-settings.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let { data }: { data: PageData } = $props();
</script>

<div class="container mx-auto max-w-4xl p-6">
	<!-- Header -->
	<div class="mb-8">
		<Button variant="ghost" size="sm" href="/projects" class="mb-4">
			<ArrowLeftIcon class="size-4" />
			Back to Projects
		</Button>

		<div>
			<h1 class="text-3xl font-bold tracking-tight">Notification Settings</h1>
			<p class="text-muted-foreground">
				Manage your push notification preferences and choose which channels you want to receive
				updates from.
			</p>
		</div>
	</div>

	<NotificationSettings projects={data.projects} currentSubscription={data.currentSubscription} />
</div>
