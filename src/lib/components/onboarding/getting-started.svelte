<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { authClient } from '$lib/client/auth/auth-client';
	import { useCurrentOrganization } from 'better-auth-ui-svelte';
	import type { Project } from '$lib/features/projects/types';
	import { page } from '$app/state';

	let {
		defaultSite
	}: {
		defaultSite: Project | null;
	} = $props();

	const organization = useCurrentOrganization();

	// State
	let isCreatingKey = $state(false);
	let apiKey = $state<string | null>(null);
	let copied = $state(false);
	let error = $state<string | null>(null);

	async function handleCreateApiKey() {
		if (!organization.data || !defaultSite) return;

		isCreatingKey = true;
		error = null;

		try {
			const { data, error: apiError } = await authClient.apiKey.create({
				name: `${defaultSite.name} API Key`,
				metadata: {
					siteId: defaultSite.id,
					orgId: organization.data.id,
					siteName: defaultSite.name
				}
			});

			if (apiError) throw new Error(apiError.message);
			if (!data?.key) throw new Error('No API key returned');

			apiKey = data.key;
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
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Sample curl command
	const sampleCurl = $derived.by(() => {
		const key = apiKey || 'your_api_key_here';
		return `curl -X POST https://your-domain.com/api/v1/events \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelName": "welcome",
    "title": "🎉 First Event",
    "description": "Your first event from the API!",
    "icon": "🎉"
  }'`;
	});
</script>

<Card.Root class="border-2">
	<Card.Header>
		<Card.Title>🚀 Get Started with EmitKit</Card.Title>
		<Card.Description>
			Follow these steps to start sending events from your applications
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Accordion.Root type="single" value="step-2" class="w-full">
			<!-- Step 1: Understanding the Architecture -->
			<Accordion.Item value="step-1">
				<Accordion.Trigger class="text-left">
					<div class="flex items-center gap-2">
						<span
							class="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
						>
							1
						</span>
						<span>How {page.data.config.appName} works</span>
					</div>
				</Accordion.Trigger>
				<Accordion.Content class="space-y-4">
					<div class="rounded-lg bg-muted p-4">
						<div class="space-y-3">
							<div class="flex items-start gap-3">
								<div
									class="flex size-8 items-center justify-center rounded-full bg-background text-sm font-semibold"
								>
									📁
								</div>
								<div class="flex-1">
									<h4 class="font-semibold">Organization</h4>
									<p class="text-sm text-muted-foreground">
										Your company or team - you're currently in: <span
											class="font-mono text-foreground">{organization.data?.name}</span
										>
									</p>
								</div>
							</div>

							<div class="ml-4 border-l-2 border-muted-foreground/20 pl-4">
								<div class="flex items-start gap-3">
									<div
										class="flex size-8 items-center justify-center rounded-full bg-background text-sm font-semibold"
									>
										🏗️
									</div>
									<div class="flex-1">
										<h4 class="font-semibold">Sites</h4>
										<p class="text-sm text-muted-foreground">
											Your different apps/projects - each API key is scoped to a specific site
										</p>
									</div>
								</div>

								<div class="mt-3 ml-4 border-l-2 border-muted-foreground/20 pl-4">
									<div class="flex items-start gap-3">
										<div
											class="flex size-8 items-center justify-center rounded-full bg-background text-sm font-semibold"
										>
											📢
										</div>
										<div class="flex-1">
											<h4 class="font-semibold">Channels</h4>
											<p class="text-sm text-muted-foreground">
												Event categories within a site (auto-created when you send events)
											</p>
											<div class="mt-2 space-y-1 text-xs text-muted-foreground">
												<p class="font-mono">• payments → Payment notifications</p>
												<p class="font-mono">• user-signups → New user alerts</p>
												<p class="font-mono">• errors → Error tracking</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					<p class="text-sm text-muted-foreground">
						<strong>Key Point:</strong> API keys are scoped to both your organization AND a specific site,
						giving you fine-grained control over which apps can send events where.
					</p>
				</Accordion.Content>
			</Accordion.Item>

			<!-- Step 2: Create API Key -->
			<Accordion.Item value="step-2">
				<Accordion.Trigger class="text-left">
					<div class="flex items-center gap-2">
						<span
							class="flex size-6 items-center justify-center rounded-full text-xs"
							class:bg-primary={!apiKey}
							class:text-primary-foreground={!apiKey}
							class:bg-green-500={apiKey}
							class:text-white={apiKey}
						>
							{#if apiKey}
								<CheckIcon class="size-4" />
							{:else}
								2
							{/if}
						</span>
						<span>Create Your API Key</span>
					</div>
				</Accordion.Trigger>
				<Accordion.Content class="space-y-4">
					{#if !apiKey}
						<div class="space-y-4">
							<p class="text-sm text-muted-foreground">
								We've created a default site for you called <span class="font-mono font-semibold"
									>"{defaultSite?.name}"</span
								>. Generate an API key to start sending events.
							</p>

							{#if error}
								<div class="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
									{error}
								</div>
							{/if}

							<Button onclick={handleCreateApiKey} disabled={isCreatingKey} class="w-full">
								{isCreatingKey ? 'Generating...' : '🔑 Generate API Key'}
							</Button>
						</div>
					{:else}
						<div class="space-y-4">
							<div class="rounded-lg bg-green-500/10 p-4">
								<p class="font-semibold text-green-600 dark:text-green-400">✓ API Key Generated!</p>
								<p class="mt-1 text-sm text-muted-foreground">
									Copy this key now - you won't be able to see it again.
								</p>
							</div>

							<div class="space-y-2">
								<Label for="api-key">Your API Key</Label>
								<div class="flex gap-2">
									<Input id="api-key" value={apiKey} readonly class="font-mono text-sm" />
									<Button variant="outline" size="icon" onclick={handleCopyKey} class="shrink-0">
										{#if copied}
											<CheckIcon class="size-4 text-green-500" />
										{:else}
											<CopyIcon class="size-4" />
										{/if}
									</Button>
								</div>
							</div>
						</div>
					{/if}
				</Accordion.Content>
			</Accordion.Item>

			<!-- Step 3: Make First API Call -->
			<Accordion.Item value="step-3">
				<Accordion.Trigger class="text-left">
					<div class="flex items-center gap-2">
						<span
							class="flex size-6 items-center justify-center rounded-full text-xs"
							class:bg-primary={apiKey}
							class:text-primary-foreground={apiKey}
							class:bg-muted={!apiKey}
							class:text-muted-foreground={!apiKey}
						>
							3
						</span>
						<span>Send Your First Event</span>
					</div>
				</Accordion.Trigger>
				<Accordion.Content class="space-y-4">
					<p class="text-sm text-muted-foreground">
						Use your API key to send events from your application:
					</p>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>Example cURL Request</Label>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => navigator.clipboard.writeText(sampleCurl)}
							>
								<CopyIcon class="mr-2 size-3" />
								Copy
							</Button>
						</div>
						<div class="overflow-x-auto rounded-lg bg-muted p-4">
							<pre class="text-xs"><code>{sampleCurl}</code></pre>
						</div>
					</div>

					<div class="rounded-lg bg-blue-500/10 p-4 text-sm">
						<p class="font-semibold text-blue-600 dark:text-blue-400">💡 What happens next?</p>
						<ul class="mt-2 space-y-1 text-muted-foreground">
							<li>• Channel "welcome" will be auto-created if it doesn't exist</li>
							<li>• Event will appear in your feed instantly</li>
							<li>• All team members will see it in real-time</li>
						</ul>
					</div>

					<div class="pt-4">
						<Button variant="outline" class="w-full" href="/docs/api">
							📖 View Full API Documentation
						</Button>
					</div>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	</Card.Content>
</Card.Root>
