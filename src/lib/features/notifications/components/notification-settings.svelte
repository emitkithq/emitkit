<script lang="ts">
	import type { ProjectWithChannels } from '$lib/features/notifications/types';
	import type { PushSubscription } from '$lib/server/db/schema';
	import { createNotificationManager } from '$lib/features/notifications/client';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { Alert } from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		projects: ProjectWithChannels[];
		currentSubscription: PushSubscription | null;
	}

	let { projects, currentSubscription }: Props = $props();

	const manager = createNotificationManager();

	// Local state that syncs with currentSubscription prop
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let subscribedChannels = $state(new SvelteSet<string>());
	let subscribeToAll = $state(false);

	// Sync local state when currentSubscription changes
	$effect(() => {
		subscribedChannels = new SvelteSet(currentSubscription?.channelIds || []);
		subscribeToAll = (currentSubscription?.channelIds?.length || 0) === 0;
	});

	// Check if a project has all channels enabled
	function isSiteEnabled(project: ProjectWithChannels): boolean {
		if (subscribeToAll) return true;
		return project.channels.every((channel) => subscribedChannels.has(channel.id));
	}

	// Toggle master switch
	async function toggleMasterSwitch(enabled: boolean) {
		if (enabled) {
			// Enable all notifications
			const success = await manager.subscribe([]);
			if (success) {
				subscribeToAll = true;
				subscribedChannels = new SvelteSet();
			}
		} else {
			// Disable all notifications
			const success = await manager.unsubscribe();
			if (success) {
				subscribeToAll = false;
				subscribedChannels = new SvelteSet();
			}
		}
	}

	// Toggle project (all channels in project)
	async function toggleSite(project: ProjectWithChannels, enabled: boolean) {
		if (enabled) {
			// Enable all channels in this project
			const newChannels = new SvelteSet(subscribedChannels);
			project.channels.forEach((channel) => newChannels.add(channel.id));
			subscribedChannels = newChannels;
			subscribeToAll = false;
		} else {
			// Disable all channels in this project
			const newChannels = new SvelteSet(subscribedChannels);
			project.channels.forEach((channel) => newChannels.delete(channel.id));
			subscribedChannels = newChannels;
			subscribeToAll = false;
		}

		// Update subscription
		await manager.updateChannels(Array.from(subscribedChannels));
	}

	// Toggle individual channel
	async function toggleChannel(channelId: string, enabled: boolean) {
		const newChannels = new SvelteSet(subscribedChannels);
		if (enabled) {
			newChannels.add(channelId);
		} else {
			newChannels.delete(channelId);
		}
		subscribedChannels = newChannels;
		subscribeToAll = false;

		// Update subscription
		await manager.updateChannels(Array.from(subscribedChannels));
	}

	// Check browser subscription on mount
	$effect(() => {
		manager.checkCurrentSubscription();
	});
</script>

<div class="space-y-6">
	<!-- Browser Support Alert -->
	{#if !manager.isSupported}
		<Alert variant="destructive">
			<AlertCircleIcon class="size-4" />
			<div class="ml-2">
				<p class="font-semibold">Push notifications not supported</p>
				<p class="text-sm">
					Your browser doesn't support push notifications. Please use a modern browser like Chrome,
					Firefox, or Edge.
				</p>
			</div>
		</Alert>
	{/if}

	<!-- Permission State Alert -->
	{#if manager.permissionState === 'denied'}
		<Alert variant="destructive">
			<AlertCircleIcon class="size-4" />
			<div class="ml-2">
				<p class="font-semibold">Notifications blocked</p>
				<p class="text-sm">
					You've blocked notifications for this folder. Please enable them in your browser settings
					to receive notifications.
				</p>
			</div>
		</Alert>
	{/if}

	<!-- Error Alert -->
	{#if manager.error}
		<Alert variant="destructive">
			<AlertCircleIcon class="size-4" />
			<div class="ml-2">
				<p class="font-semibold">Error</p>
				<p class="text-sm">{manager.error}</p>
			</div>
		</Alert>
	{/if}

	<!-- Main Card -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="flex items-center gap-2">
						{#if manager.isSubscribed}
							<BellIcon class="size-5" />
						{:else}
							<BellOffIcon class="size-5" />
						{/if}
						Push Notifications
					</Card.Title>
					<Card.Description>
						{#if manager.isSubscribed}
							Manage which channels send you browser notifications
						{:else}
							Enable notifications to receive real-time updates
						{/if}
					</Card.Description>
				</div>

				{#if manager.isSubscribed}
					<div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
						<CheckCircleIcon class="size-4" />
						<span>Active</span>
					</div>
				{/if}
			</div>
		</Card.Header>

		<Card.Content class="space-y-6">
			<!-- Enable Notifications Button -->
			{#if !manager.isSubscribed}
				<div class="flex flex-col items-center justify-center space-y-4 py-8">
					<BellIcon class="size-12 text-muted-foreground" />
					<div class="text-center">
						<p class="font-semibold">Enable push notifications</p>
						<p class="text-sm text-muted-foreground">
							Get instant notifications for important events
						</p>
					</div>
					<Button
						onclick={() => toggleMasterSwitch(true)}
						disabled={!manager.isSupported || manager.isLoading}
						class="min-w-[200px]"
					>
						{#if manager.isLoading}
							<Spinner class="size-4" />
							Enabling...
						{:else}
							<BellIcon class="size-4" />
							Enable Notifications
						{/if}
					</Button>
				</div>
			{:else}
				<!-- Master Toggle -->
				<div class="flex items-center justify-between rounded-lg border p-4">
					<div class="space-y-0.5">
						<Label for="master-toggle" class="text-base font-semibold">All Notifications</Label>
						<p class="text-sm text-muted-foreground">
							{subscribeToAll
								? 'Receiving notifications from all channels'
								: `Receiving notifications from ${subscribedChannels.size} channel${subscribedChannels.size !== 1 ? 's' : ''}`}
						</p>
					</div>
					<Switch
						id="master-toggle"
						checked={manager.isSubscribed}
						onCheckedChange={toggleMasterSwitch}
						disabled={manager.isLoading}
					/>
				</div>

				<!-- Sites and Channels -->
				{#if manager.isSubscribed && !subscribeToAll}
					<div class="space-y-4">
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<InfoIcon class="size-4" />
							<span>Configure notifications per project and channel</span>
						</div>

						{#each projects as project (project.id)}
							<Card.Root class="border-muted">
								<Card.Header class="pb-3">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<div>
												<Card.Title class="text-base">{project.name}</Card.Title>
												<p class="text-xs text-muted-foreground">
													{project.channels.length} channel{project.channels.length !== 1
														? 's'
														: ''}
												</p>
											</div>
										</div>
										<Switch
											checked={isSiteEnabled(project)}
											onCheckedChange={(enabled) => toggleSite(project, enabled)}
											disabled={manager.isLoading}
										/>
									</div>
								</Card.Header>

								{#if project.channels.length > 0}
									<Card.Content class="space-y-2 pt-0">
										{#each project.channels as channel (channel.id)}
											<div
												class="flex items-center justify-between rounded-md border border-transparent p-2 hover:border-muted"
											>
												<div class="flex items-center gap-2">
													<div>
														<p class="text-sm font-medium">{channel.name}</p>
														{#if channel.description}
															<p class="text-xs text-muted-foreground">{channel.description}</p>
														{/if}
													</div>
												</div>
												<Switch
													checked={subscribeToAll || subscribedChannels.has(channel.id)}
													onCheckedChange={(enabled) => toggleChannel(channel.id, enabled)}
													disabled={manager.isLoading || subscribeToAll}
												/>
											</div>
										{/each}
									</Card.Content>
								{/if}
							</Card.Root>
						{/each}
					</div>
				{/if}

				<!-- Disable All Button -->
				<div class="flex justify-end pt-4">
					<Button
						variant="outline"
						onclick={() => toggleMasterSwitch(false)}
						disabled={manager.isLoading}
					>
						{#if manager.isLoading}
							<Spinner class="size-4" />
							Disabling...
						{:else}
							<BellOffIcon class="size-4" />
							Disable All Notifications
						{/if}
					</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Device Info -->
	{#if manager.isSubscribed && manager.currentEndpoint}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm">Device Information</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-xs text-muted-foreground">
					This browser is registered for push notifications.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
