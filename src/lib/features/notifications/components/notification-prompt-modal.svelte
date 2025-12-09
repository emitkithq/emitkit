<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { createNotificationManager } from '$lib/features/notifications/client';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';

	let { item }: StackItemProps<{ enabled: boolean }> = $props();

	const manager = createNotificationManager();

	async function handleEnable() {
		const success = await manager.subscribe([]);
		if (success) {
			item.resolve({ enabled: true });
		}
	}

	function handleSkip() {
		item.resolve({ enabled: false });
	}
</script>

<Dialog.Root open={true} onOpenChange={(open) => !open && handleSkip()}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<BellIcon class="size-5" />
				Enable Push Notifications
			</Dialog.Title>
			<Dialog.Description>
				Stay up-to-date with real-time notifications for important events in your channels.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			{#if !manager.isSupported}
				<div class="rounded-lg bg-destructive/10 p-4">
					<p class="text-sm font-semibold text-destructive">
						Push notifications are not supported in this browser
					</p>
					<p class="mt-1 text-xs text-muted-foreground">
						Please use a modern browser like Chrome, Firefox, or Edge.
					</p>
				</div>
			{:else if manager.permissionState === 'denied'}
				<div class="rounded-lg bg-destructive/10 p-4">
					<p class="text-sm font-semibold text-destructive">Notifications are blocked</p>
					<p class="mt-1 text-xs text-muted-foreground">
						You've blocked notifications for this site. Please enable them in your browser settings.
					</p>
				</div>
			{:else}
				<div class="space-y-3">
					<div class="flex items-start gap-3 rounded-lg bg-muted p-3">
						<div class="rounded-full bg-primary/10 p-2">
							<BellIcon class="size-4 text-primary" />
						</div>
						<div class="flex-1">
							<p class="text-sm font-medium">Never miss an important event</p>
							<p class="text-xs text-muted-foreground">
								Get instant notifications when events occur in your channels
							</p>
						</div>
					</div>

					<div class="flex items-start gap-3 rounded-lg bg-muted p-3">
						<div class="rounded-full bg-primary/10 p-2">
							<BellIcon class="size-4 text-primary" />
						</div>
						<div class="flex-1">
							<p class="text-sm font-medium">Customize your preferences</p>
							<p class="text-xs text-muted-foreground">
								Choose which channels send notifications in settings
							</p>
						</div>
					</div>
				</div>
			{/if}

			{#if manager.error}
				<div class="rounded-lg bg-destructive/10 p-4">
					<p class="text-sm font-semibold text-destructive">Error</p>
					<p class="mt-1 text-xs text-muted-foreground">{manager.error}</p>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleSkip} disabled={manager.isLoading}>
				<BellOffIcon class="mr-2 size-4" />
				Not Now
			</Button>
			<Button onclick={handleEnable} disabled={!manager.isSupported || manager.isLoading}>
				{#if manager.isLoading}
					<Spinner class="mr-2 size-4" />
					Enabling...
				{:else}
					<BellIcon class="mr-2 size-4" />
					Enable Notifications
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
