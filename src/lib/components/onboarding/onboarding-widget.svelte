<script lang="ts">
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { authClient } from '$lib/client/auth/auth-client';
	import type { Project } from '$lib/features/projects/types';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import XIcon from '@lucide/svelte/icons/x';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	interface Props {
		defaultSite: Project | null;
		hasEvents: boolean;
		organizationId: string;
		placement?: 'sidebar' | 'floating';
		onCollapse?: () => void;
		onExpand?: () => void;
	}

	let {
		defaultSite,
		hasEvents,
		organizationId,
		placement = 'sidebar',
		onCollapse,
		onExpand
	}: Props = $props();

	// Local state
	let dismissed = $state(false);
	let collapsed = $state(false);
	let apiKeyCreated = $state(false);
	let apiKey = $state<string | null>(null);
	let isCreatingKey = $state(false);
	let showApiGuide = $state(false);
	let copySuccess = $state(false);
	let error = $state<string | null>(null);

	// Derived
	const completedSteps = $derived(
		1 + // Step 1 always complete (default site created)
			(apiKeyCreated ? 1 : 0) +
			(hasEvents ? 1 : 0)
	);

	const allStepsComplete = $derived(completedSteps === 3);

	// localStorage key
	const storageKey = $derived(`onboarding-widget-${organizationId}`);

	// Load state from localStorage
	onMount(() => {
		loadState();
	});

	function loadState() {
		if (typeof window === 'undefined') return;

		try {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const state = JSON.parse(stored);
				dismissed = state.dismissed ?? false;
				collapsed = state.collapsed ?? false;
				apiKeyCreated = state.apiKeyCreated ?? false;
				apiKey = state.apiKey ?? null;
			}
		} catch (err) {
			console.error('Failed to load onboarding state:', err);
		}
	}

	function saveState() {
		if (typeof window === 'undefined') return;

		try {
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					dismissed,
					collapsed,
					apiKeyCreated,
					apiKey
				})
			);
		} catch (err) {
			console.error('Failed to save onboarding state:', err);
		}
	}

	// Auto-save state changes
	$effect(() => {
		// Track these values
		dismissed;
		collapsed;
		apiKeyCreated;
		apiKey;

		// Save whenever they change
		saveState();
	});

	function handleCollapse() {
		collapsed = !collapsed;
		if (onCollapse) {
			onCollapse();
		}
	}

	function handleDismiss() {
		dismissed = true;
	}

	async function handleCreateApiKey() {
		if (!defaultSite) return;

		isCreatingKey = true;
		error = null;

		try {
			const { data, error: apiError } = await authClient.apiKey.create({
				name: `${defaultSite.name} API Key`,
				metadata: {
					siteId: defaultSite.id,
					orgId: organizationId,
					siteName: defaultSite.name
				}
			});

			if (apiError) throw new Error(apiError.message);
			if (!data?.key) throw new Error('No API key returned');

			apiKey = data.key;
			apiKeyCreated = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create API key';
		} finally {
			isCreatingKey = false;
		}
	}

	async function handleCopyKey() {
		if (!apiKey) return;

		try {
			await navigator.clipboard.writeText(apiKey);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Sample curl command for guide
	const curlExample = `curl -X POST https://api.your-domain.com/events \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"channelName": "welcome", "title": "First Event"}'`;
</script>

{#if !dismissed}
	{#if placement === 'floating'}
		<!-- Floating Button Only -->
		<button
			onclick={() => onExpand?.()}
			class="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-2xl transition-all hover:scale-105 hover:shadow-xl"
			transition:slide={{ duration: 300, axis: 'y' }}
			type="button"
		>
			<RocketIcon class="size-4" />
			<span>Setup ({completedSteps}/3)</span>
		</button>
	{:else}
		<!-- Sidebar Widget -->
		<div
			class="w-full rounded-md border border-border bg-card/50 shadow-sm"
			transition:slide={{ duration: 300, axis: 'y' }}
		>
			<!-- Header -->
			<div class="flex w-full items-center justify-between border-b border-border px-3 py-2">
				<button
					onclick={handleCollapse}
					class="flex flex-1 items-center gap-2 text-left transition-opacity hover:opacity-80"
					type="button"
					aria-label="Toggle widget"
				>
					<RocketIcon class="size-4 text-primary" />
					<span class="text-sm font-medium">Get Started</span>
					<span class="text-xs text-muted-foreground">({completedSteps}/3)</span>
				</button>

				<div class="flex items-center gap-0.5">
					<button
						onclick={handleCollapse}
						class="rounded p-1 transition-colors hover:bg-accent"
						type="button"
						aria-label={collapsed ? 'Expand' : 'Collapse'}
					>
						{#if collapsed}
							<PlusIcon class="size-3.5" />
						{:else}
							<MinusIcon class="size-3.5" />
						{/if}
					</button>

					<button
						onclick={handleDismiss}
						class="rounded p-1 transition-colors hover:bg-accent"
						type="button"
						aria-label="Dismiss"
					>
						<XIcon class="size-3.5" />
					</button>
				</div>
			</div>

			<!-- Body -->
			{#if !collapsed}
				<div
					class="max-h-[400px] space-y-2 overflow-y-auto p-3"
					transition:slide={{ duration: 200 }}
				>
					<!-- Step 1: Default Site Created (Always Complete) -->
					<div class="rounded border border-border/50 bg-background p-2">
						<div class="flex items-center gap-2">
							<div class="flex size-4 shrink-0 items-center justify-center">
								<CheckIcon class="size-4 text-green-500" />
							</div>
							<div class="flex-1">
								<div class="text-sm font-medium">Default project created</div>
								{#if defaultSite}
									<div class="text-xs text-muted-foreground">'{defaultSite.name}'</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Step 2: Create API Key -->
					<div class="rounded border border-border/50 bg-background p-2">
						<div class="flex items-start gap-2">
							<div class="mt-0.5 flex size-4 shrink-0 items-center justify-center">
								{#if apiKeyCreated}
									<CheckIcon class="size-4 text-green-500" />
								{:else}
									<CircleIcon class="size-3 text-muted-foreground" />
								{/if}
							</div>
							<div class="flex-1 space-y-1.5">
								<div class="text-sm font-medium">Create your API key</div>

								{#if !apiKeyCreated}
									{#if error}
										<div class="rounded bg-destructive/10 p-1.5 text-xs text-destructive">
											{error}
										</div>
									{/if}

									<Button
										onclick={handleCreateApiKey}
										disabled={isCreatingKey}
										size="sm"
										class="h-7 w-full text-xs"
									>
										{isCreatingKey ? 'Generating...' : 'Generate API Key'}
									</Button>
								{:else}
									<div class="space-y-1.5">
										<div class="text-xs text-green-600 dark:text-green-400">✓ API key created</div>

										{#if apiKey}
											<div class="flex gap-1.5">
												<Input
													value={apiKey}
													readonly
													class="h-7 flex-1 font-mono text-[10px]"
													aria-label="API Key"
												/>
												<Button
													variant="outline"
													size="icon"
													onclick={handleCopyKey}
													class="h-7 w-7 shrink-0"
												>
													{#if copySuccess}
														<CheckIcon class="size-3 text-green-500" />
													{:else}
														<CopyIcon class="size-3" />
													{/if}
												</Button>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Step 3: Send First Event -->
					<div class="rounded border border-border/50 bg-background p-2">
						<div class="flex items-start gap-2">
							<div class="mt-0.5 flex size-4 shrink-0 items-center justify-center">
								{#if hasEvents}
									<CheckIcon class="size-4 text-green-500" />
								{:else}
									<CircleIcon class="size-3 text-muted-foreground" />
								{/if}
							</div>
							<div class="flex-1 space-y-1.5">
								<div class="text-sm font-medium">Send your first event</div>

								{#if hasEvents}
									<div class="text-xs text-green-600 dark:text-green-400">✓ First event sent</div>
								{:else}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (showApiGuide = !showApiGuide)}
										class="h-6 w-full justify-between px-2 text-xs"
									>
										<span>View guide</span>
										<ChevronDownIcon
											class={showApiGuide
												? 'size-3 rotate-180 transition-transform'
												: 'size-3 transition-transform'}
										/>
									</Button>

									{#if showApiGuide}
										<div
											class="space-y-1.5 rounded bg-muted p-2 text-xs"
											transition:slide={{ duration: 200 }}
										>
											<div class="font-medium">Example:</div>
											<pre class="overflow-x-auto text-[10px] leading-relaxed"><code
													>{curlExample}</code
												></pre>
											<div class="text-[10px] text-muted-foreground">
												Replace YOUR_API_KEY with your key
											</div>
										</div>
									{/if}
								{/if}
							</div>
						</div>
					</div>

					<!-- Success Message -->
					{#if allStepsComplete}
						<div
							class="rounded border border-green-500/20 bg-green-500/10 p-2 text-xs"
							transition:fade={{ duration: 200 }}
						>
							<div class="flex items-center gap-1.5">
								<CheckIcon class="size-3 text-green-500" />
								<span class="font-medium text-green-600 dark:text-green-400"
									>You're all set! 🎉</span
								>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}
