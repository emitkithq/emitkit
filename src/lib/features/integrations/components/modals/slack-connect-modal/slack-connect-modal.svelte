<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { createIntegrationCommand } from '$lib/features/integrations/integrations.remote';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';

	interface Props {
		organizationId: string;
	}

	let {
		item,
		organizationId
	}: StackItemProps<{ confirmed: boolean; integrationId?: string }> & Props = $props();

	// Form state
	let botToken = $state('');
	let slackChannelId = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Bot token verification state
	let isVerifying = $state(false);
	let isTokenVerified = $state(false);
	let workspaceName = $state('');
	let slackChannels = $state<Array<{ id: string; name: string }>>([]);
	let isLoadingChannels = $state(false);

	// Reset Slack channel selection when bot token changes
	$effect(() => {
		if (botToken) {
			isTokenVerified = false;
			workspaceName = '';
			slackChannels = [];
			slackChannelId = '';
		}
	});

	// Validation
	const isValid = $derived(
		botToken.trim() !== '' && isTokenVerified && slackChannelId.trim() !== ''
	);

	function handleCancel() {
		item.resolve({ confirmed: false });
	}

	/**
	 * Verify the Slack bot token and load available channels
	 */
	async function handleVerifyToken() {
		if (!botToken.trim()) {
			toast.error('Please enter a bot token');
			return;
		}

		isVerifying = true;
		error = null;

		try {
			// Call server-side function to verify token
			const response = await fetch('/api/integrations/slack/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ botToken: botToken.trim() })
			});

			const data = await response.json();

			if (data.valid) {
				isTokenVerified = true;
				workspaceName = data.workspace || 'Unknown Workspace';
				toast.success(`Connected to workspace: ${workspaceName}`);

				// Load channels
				await loadSlackChannels();
			} else {
				error = data.error || 'Failed to verify bot token';
				isTokenVerified = false;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to verify bot token';
			isTokenVerified = false;
		} finally {
			isVerifying = false;
		}
	}

	/**
	 * Load Slack channels using the verified bot token
	 */
	async function loadSlackChannels() {
		isLoadingChannels = true;

		try {
			const response = await fetch('/api/integrations/slack/channels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ botToken: botToken.trim() })
			});

			const data = await response.json();

			if (data.channels) {
				slackChannels = data.channels.map((ch: any) => ({
					id: ch.id,
					name: ch.is_private ? `🔒 ${ch.name}` : `# ${ch.name}`
				}));
			} else {
				error = data.error || 'Failed to load channels';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load channels';
		} finally {
			isLoadingChannels = false;
		}
	}

	async function handleSubmit() {
		if (!isValid) return;

		isSubmitting = true;
		error = null;

		try {
			// Find selected channel name
			const selectedSlackChannel = slackChannels.find((ch) => ch.id === slackChannelId);

			// Build payload - always organization-scoped
			// Workflows handle the filtering based on their trigger configuration
			const payload = {
				scope: 'organization' as const,
				type: 'slack' as const,
				config: {
					botToken: botToken.trim(),
					slackChannelId: slackChannelId.trim(),
					slackChannelName: selectedSlackChannel?.name,
					slackWorkspaceName: workspaceName
				},
				eventFilters: {
					eventTypes: ['all'] as string[]
				}
			};

			const result = await createIntegrationCommand(payload);

			if (result.success) {
				toast.success('Slack integration connected successfully');
				item.resolve({ confirmed: true, integrationId: result.integration.id });
			} else {
				throw new Error('Failed to create integration');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to connect Slack integration';
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[500px]">
		<Dialog.Header>
			<Dialog.Title>Connect Slack</Dialog.Title>
			<Dialog.Description>
				Add your Slack workspace credentials. Use workflows to control when and where notifications
				are sent.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">

			<!-- Bot Token Input -->
			<div class="space-y-2">
				<Label for="bot-token">Slack Bot Token *</Label>
				<div class="flex gap-2">
					<Input
						id="bot-token"
						type="password"
						bind:value={botToken}
						placeholder="xoxb-..."
						disabled={isSubmitting || isVerifying}
						required
						class="flex-1"
					/>
					<Button
						type="button"
						variant="outline"
						onclick={handleVerifyToken}
						disabled={!botToken.trim() || isVerifying || isSubmitting}
					>
						{#if isVerifying}
							<LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
							Verifying...
						{:else if isTokenVerified}
							<CheckCircleIcon class="mr-2 h-4 w-4 text-green-600" />
							Verified
						{:else}
							Verify Token
						{/if}
					</Button>
				</div>
				<p class="text-sm text-muted-foreground">
					Create a Slack app and copy the Bot User OAuth Token (starts with xoxb-)
				</p>
				{#if isTokenVerified && workspaceName}
					<Alert.Root class="border-green-600 bg-green-50 dark:bg-green-950">
						<CheckCircleIcon class="size-4 text-green-600" />
						<Alert.Title class="text-green-900 dark:text-green-100">Token Verified</Alert.Title>
						<Alert.Description class="text-green-800 dark:text-green-200">
							Connected to workspace: <strong>{workspaceName}</strong>
						</Alert.Description>
					</Alert.Root>
				{/if}
			</div>

			<!-- Slack Channel Selection -->
			{#if isTokenVerified}
				<div class="space-y-2">
					<Label for="slack-channel">Slack Channel *</Label>
					{#if isLoadingChannels}
						<p class="text-sm text-muted-foreground">Loading channels...</p>
					{:else if slackChannels.length > 0}
						{@const selectedSlackChannel = slackChannels.find((ch) => ch.id === slackChannelId)}
						<Select.Root type="single" bind:value={slackChannelId} disabled={isSubmitting}>
							<Select.Trigger id="slack-channel">
								{selectedSlackChannel?.name ?? 'Choose a channel'}
							</Select.Trigger>
							<Select.Content>
								{#each slackChannels as channel (channel.id)}
									<Select.Item value={channel.id}>{channel.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<p class="text-sm text-muted-foreground">
							Select the Slack channel where notifications will be posted
						</p>
					{:else}
						<p class="text-sm text-muted-foreground">No channels available</p>
					{/if}
				</div>
			{/if}

			<!-- Error Display -->
			{#if error}
				<Alert.Root variant="destructive">
					<AlertCircleIcon class="size-4" />
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
				Cancel
			</Button>
			<Button type="button" onclick={handleSubmit} disabled={!isValid || isSubmitting}>
				{isSubmitting ? 'Connecting...' : 'Connect Slack'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
