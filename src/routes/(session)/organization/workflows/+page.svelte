<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import WorkflowIcon from '@lucide/svelte/icons/workflow';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ZapOffIcon from '@lucide/svelte/icons/zap-off';
	import { createWorkflowCommand } from '$lib/features/workflows/workflows.remote';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Create workflow dialog state
	let showCreateDialog = $state(false);
	let isCreating = $state(false);
	let createForm = $state({
		name: '',
		description: '',
		enabled: true
	});

	async function handleCreateWorkflow() {
		if (!createForm.name.trim()) return;

		isCreating = true;
		try {
			const result = await createWorkflowCommand({
				name: createForm.name,
				description: createForm.description || undefined,
				enabled: createForm.enabled
			});

			if (result.success && result.workflow) {
				// Navigate to the workflow builder
				await goto(`/organization/workflows/${result.workflow.id}`);
			}
		} catch (error) {
			console.error('Failed to create workflow:', error);
		} finally {
			isCreating = false;
			showCreateDialog = false;
			// Reset form
			createForm = {
				name: '',
				description: '',
				enabled: true
			};
		}
	}

	function formatDate(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - new Date(date).getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
		return 'just now';
	}
</script>

<div class="container mx-auto p-6">
	<div class="mb-8 flex items-center justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">Workflows</h1>
			<p class="text-muted-foreground">
				Automate actions when events occur in your channels
			</p>
		</div>
		<Button size="sm" onclick={() => (showCreateDialog = true)}>
			<PlusIcon class="mr-2 h-4 w-4" />
			Create Workflow
		</Button>
	</div>

	<!-- Create Workflow Dialog -->
	<Dialog.Root bind:open={showCreateDialog}>
		<Dialog.Content class="sm:max-w-[500px]">
			<Dialog.Header>
				<Dialog.Title>Create Workflow</Dialog.Title>
				<Dialog.Description>
					Create a new workflow to automate actions based on events
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input
						id="name"
						placeholder="Notify team on error"
						bind:value={createForm.name}
						disabled={isCreating}
					/>
				</div>
				<div class="space-y-2">
					<Label for="description">Description (optional)</Label>
					<Textarea
						id="description"
						placeholder="Send Slack notification when error events are received"
						bind:value={createForm.description}
						disabled={isCreating}
					/>
				</div>
				<div class="flex items-center space-x-2">
					<Switch id="enabled" bind:checked={createForm.enabled} disabled={isCreating} />
					<Label for="enabled">Enable workflow</Label>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (showCreateDialog = false)} disabled={isCreating}>
					Cancel
				</Button>
				<Button onclick={handleCreateWorkflow} disabled={isCreating || !createForm.name.trim()}>
					{#if isCreating}
						<Spinner class="mr-2 h-4 w-4" />
						Creating...
					{:else}
						Create
					{/if}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	{#if data.workflows.items.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<WorkflowIcon />
				</Empty.Media>
				<Empty.Title>No workflows yet</Empty.Title>
				<Empty.Description>
					Create your first workflow to automate actions based on events
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => (showCreateDialog = true)}>
					<PlusIcon class="mr-2 h-4 w-4" />
					Create Workflow
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.workflows.items as workflow (workflow.id)}
				<Card.Root
					class="cursor-pointer transition-all hover:shadow-md"
					onclick={() => goto(`/organization/workflows/${workflow.id}`)}
				>
					<Card.Header>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<Card.Title class="text-lg">{workflow.name}</Card.Title>
								{#if workflow.description}
									<Card.Description class="mt-1.5 line-clamp-2">
										{workflow.description}
									</Card.Description>
								{/if}
							</div>
							<Badge variant={workflow.enabled ? 'default' : 'secondary'}>
								{#if workflow.enabled}
									<ZapIcon class="mr-1 h-3 w-3" />
									Active
								{:else}
									<ZapOffIcon class="mr-1 h-3 w-3" />
									Disabled
								{/if}
							</Badge>
						</div>
					</Card.Header>
					<Card.Content>
						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							<div class="flex items-center gap-1">
								<WorkflowIcon class="h-4 w-4" />
								<span>{workflow.nodes.length} nodes</span>
							</div>
							<div class="flex items-center gap-1">
								<ClockIcon class="h-4 w-4" />
								<span>{formatDate(workflow.updatedAt)}</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<!-- Pagination -->
		{#if data.workflows.metadata.totalPages > 1}
			<div class="mt-6 flex items-center justify-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!data.workflows.metadata.hasPreviousPage}
					onclick={() => goto(`?page=${data.workflows.metadata.page - 1}`)}
				>
					Previous
				</Button>
				<span class="text-sm text-muted-foreground">
					Page {data.workflows.metadata.page} of {data.workflows.metadata.totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={!data.workflows.metadata.hasNextPage}
					onclick={() => goto(`?page=${data.workflows.metadata.page + 1}`)}
				>
					Next
				</Button>
			</div>
		{/if}
	{/if}
</div>
