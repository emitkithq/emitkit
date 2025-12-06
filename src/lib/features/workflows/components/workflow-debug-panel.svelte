<script lang="ts">
	import { dev } from '$app/environment';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import BugIcon from '@lucide/svelte/icons/bug';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import XIcon from '@lucide/svelte/icons/x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { toast } from 'svelte-sonner';

	import { workflowStore } from '$lib/features/workflows/stores/workflow-store.svelte';

	let {
		data
	}: {
		data: {
			workflow: any;
			channels: any[];
			folders: any[];
			organizationId: string;
		};
	} = $props();

	// State
	let isExpanded = $state(false);
	let copied = $state(false);
	let activeTab = $state('overview');

	// Only render in dev mode
	if (!dev) {
		// Don't render anything in production
	}

	// Computed debug data
	let debugData = $derived({
		workflow: data.workflow,
		store: {
			nodes: workflowStore.nodes.map((n) => ({
				id: n.id,
				type: n.type,
				position: n.position,
				data: n.data
			})),
			edges: workflowStore.edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				type: e.type
			})),
			isDirty: workflowStore.isDirty,
			selectedNode: workflowStore.selectedNode
				? {
						id: workflowStore.selectedNode.id,
						type: workflowStore.selectedNode.type,
						data: workflowStore.selectedNode.data
					}
				: null
		},
		serverData: {
			channels: data.channels,
			folders: data.folders,
			organizationId: data.organizationId
		},
		metadata: {
			timestamp: new Date().toISOString(),
			url: browser ? window.location.href : ''
		}
	});

	// Formatted JSON
	let formattedJson = $derived(JSON.stringify(debugData, null, 2));

	// Copy to clipboard
	async function copyToClipboard() {
		if (!browser) return;

		try {
			await navigator.clipboard.writeText(formattedJson);
			copied = true;
			toast.success('Debug data copied to clipboard');

			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
			toast.error('Failed to copy to clipboard');
		}
	}

	// Toggle panel
	function togglePanel() {
		isExpanded = !isExpanded;
	}
</script>

{#if dev}
	<div class="fixed right-4 bottom-4 z-50">
		{#if !isExpanded}
			<!-- Minimized floating button -->
			<Button
				onclick={togglePanel}
				size="icon"
				variant="destructive"
				class="h-12 w-12 rounded-full shadow-lg"
				title="Open Debug Panel"
			>
				<BugIcon class="h-6 w-6" />
			</Button>
		{:else}
			<!-- Expanded panel -->
			<Card.Root class="h-[650px] w-[450px] shadow-2xl">
				<Card.Header class="border-b pb-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<BugIcon class="h-5 w-5 text-destructive" />
							<Card.Title class="text-lg">Workflow Debug</Card.Title>
						</div>
						<div class="flex items-center gap-2">
							<Button onclick={copyToClipboard} size="sm" variant="outline" class="h-8">
								{#if copied}
									<CheckIcon class="mr-1 h-4 w-4 text-green-500" />
									Copied!
								{:else}
									<CopyIcon class="mr-1 h-4 w-4" />
									Copy All
								{/if}
							</Button>
							<Button onclick={togglePanel} size="icon" variant="ghost" class="h-8 w-8">
								<XIcon class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</Card.Header>

				<Card.Content class="h-[calc(100%-5rem)] p-0">
					<Tabs.Root bind:value={activeTab} class="flex h-full flex-col">
						<div class="border-b px-4 pt-3">
							<Tabs.List class="grid w-full grid-cols-3">
								<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
								<Tabs.Trigger value="workflow">Workflow</Tabs.Trigger>
								<Tabs.Trigger value="store">Store</Tabs.Trigger>
							</Tabs.List>
						</div>

						<!-- Overview Tab -->
						<Tabs.Content value="overview" class="flex-1 space-y-4 overflow-y-auto p-4">
							<div class="space-y-3">
								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Workflow Info</h3>
									<div class="space-y-1 text-sm">
										<div class="flex justify-between">
											<span class="text-muted-foreground">ID:</span>
											<code class="text-primary">{data.workflow.id}</code>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Name:</span>
											<span>{data.workflow.name}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Enabled:</span>
											<span
												class={data.workflow.enabled
													? 'text-green-600 dark:text-green-400'
													: 'text-destructive'}
											>
												{data.workflow.enabled ? 'Yes' : 'No'}
											</span>
										</div>
									</div>
								</div>

								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Graph Stats</h3>
									<div class="space-y-1 text-sm">
										<div class="flex justify-between">
											<span class="text-muted-foreground">Nodes:</span>
											<span>{workflowStore.nodes.length}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Edges:</span>
											<span>{workflowStore.edges.length}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Dirty:</span>
											<span
												class={workflowStore.isDirty
													? 'text-yellow-600 dark:text-yellow-400'
													: 'text-green-600 dark:text-green-400'}
											>
												{workflowStore.isDirty ? 'Yes (Unsaved)' : 'No'}
											</span>
										</div>
									</div>
								</div>

								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Selected Node</h3>
									<div class="text-sm">
										{#if workflowStore.selectedNode}
											<div class="space-y-1">
												<div class="flex justify-between">
													<span class="text-muted-foreground">ID:</span>
													<code class="text-primary">{workflowStore.selectedNode.id}</code>
												</div>
												<div class="flex justify-between">
													<span class="text-muted-foreground">Type:</span>
													<span class="text-accent-foreground"
														>{workflowStore.selectedNode.type}</span
													>
												</div>
												<div class="flex justify-between">
													<span class="text-muted-foreground">Label:</span>
													<span>{workflowStore.selectedNode.data.label}</span>
												</div>
											</div>
										{:else}
											<span class="text-muted-foreground italic">None</span>
										{/if}
									</div>
								</div>

								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Server Data</h3>
									<div class="space-y-1 text-sm">
										<div class="flex justify-between">
											<span class="text-muted-foreground">Channels:</span>
											<span>{data.channels?.length || 0}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Folders:</span>
											<span>{data.folders?.length || 0}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Org ID:</span>
											<code class="text-xs text-primary">{data.organizationId}</code>
										</div>
									</div>
								</div>
							</div>
						</Tabs.Content>

						<!-- Workflow JSON Tab -->
						<Tabs.Content value="workflow" class="flex-1 overflow-y-auto p-4">
							<div class="relative">
								<pre class="overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code
										>{JSON.stringify(data.workflow, null, 2)}</code
									></pre>
							</div>
						</Tabs.Content>

						<!-- Store State Tab -->
						<Tabs.Content value="store" class="flex-1 overflow-y-auto p-4">
							<div class="space-y-4">
								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Nodes</h3>
									<pre class="overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code
											>{JSON.stringify(debugData.store.nodes, null, 2)}</code
										></pre>
								</div>

								<div>
									<h3 class="mb-2 text-sm font-semibold text-muted-foreground">Edges</h3>
									<pre class="overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code
											>{JSON.stringify(debugData.store.edges, null, 2)}</code
										></pre>
								</div>

								{#if debugData.store.selectedNode}
									<div>
										<h3 class="mb-2 text-sm font-semibold text-muted-foreground">
											Selected Node Config
										</h3>
										<pre class="overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code
												>{JSON.stringify(debugData.store.selectedNode, null, 2)}</code
											></pre>
									</div>
								{/if}
							</div>
						</Tabs.Content>
					</Tabs.Root>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}
