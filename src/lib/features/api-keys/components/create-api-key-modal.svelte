<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import type { Project } from '$lib/server/db/schema';
	import type { ApiKeyCreateResponse } from '../types';
	import { authClient } from '$lib/client/auth/auth-client';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';

	interface Props {
		projects: Project[];
		organizationId: string;
		userId: string;
	}

	let {
		item,
		projects,
		organizationId,
		userId
	}: StackItemProps<{ success: boolean; apiKey?: ApiKeyCreateResponse }> & Props = $props();

	let name = $state('');
	let selectedProjectId = $state<string | undefined>(undefined);
	let isSubmitting = $state(false);
	let createdKey = $state<ApiKeyCreateResponse | null>(null);
	let copied = $state(false);

	const selectedProject = $derived(projects.find((p) => p.id === selectedProjectId) ?? projects[0]);

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!name.trim()) {
			toast.error('Please enter a name for the API key');
			return;
		}

		if (!selectedProjectId) {
			toast.error('Please select a project');
			return;
		}

		const project = projects.find((p) => p.id === selectedProjectId);
		if (!project) {
			toast.error('Project not found');
			return;
		}

		isSubmitting = true;

		try {
			const { data, error } = await authClient.apiKey.create({
				name: name.trim(),
				userId: userId,
				metadata: {
					projectId: selectedProjectId,
					orgId: organizationId,
					projectName: project.name
				}
				// rateLimitEnabled: true
			});

			if (error) {
				throw new Error(error.message || 'Failed to create API key');
			}

			if (!data) {
				throw new Error('No data returned from API key creation');
			}

			createdKey = {
				key: data.key,
				id: data.id,
				name: data.name ?? name.trim(),
				start: data.start ?? '',
				createdAt: data.createdAt
			} as ApiKeyCreateResponse;

			toast.success('API key created successfully');
		} catch (error) {
			console.error('Failed to create API key:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to create API key');
			item.resolve({ success: false });
		} finally {
			isSubmitting = false;
		}
	}

	function handleCancel() {
		item.resolve({ success: false });
	}

	function handleDone() {
		item.resolve({ success: true, apiKey: createdKey ?? undefined });
	}

	async function copyToClipboard() {
		if (!createdKey) return;

		try {
			await navigator.clipboard.writeText(createdKey.key);
			copied = true;
			toast.success('API key copied to clipboard');
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
			toast.error('Failed to copy to clipboard');
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[500px]">
		{#if !createdKey}
			<Dialog.Header>
				<Dialog.Title>Create API Key</Dialog.Title>
				<Dialog.Description>
					Create a new API key to access the API for a specific project.
				</Dialog.Description>
			</Dialog.Header>

			<form onsubmit={handleSubmit} class="space-y-6">
				<Field.Group>
					<Field.Field>
						<Field.Label for="api-key-name">Key Name *</Field.Label>
						<Input
							id="api-key-name"
							bind:value={name}
							placeholder="e.g. Production API Key"
							disabled={isSubmitting}
							required
						/>
						<Field.Description>A descriptive name for your API key</Field.Description>
					</Field.Field>

					<Field.Field>
						<Field.Label for="project-select">Project *</Field.Label>
						<Select.Root type="single" bind:value={selectedProjectId} disabled={isSubmitting}>
							<Select.Trigger id="project-select">
								{selectedProject?.name ?? 'Select a project'}
							</Select.Trigger>
							<Select.Content>
								{#each projects as project (project.id)}
									<Select.Item value={project.id}>
										<div class="flex flex-col">
											<span>{project.name}</span>
											<span class="text-xs text-muted-foreground">{project.slug}</span>
										</div>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>The project this API key will be scoped to</Field.Description>
					</Field.Field>
				</Field.Group>

				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'Creating...' : 'Create API Key'}
					</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<Dialog.Header>
				<Dialog.Title>API Key Created</Dialog.Title>
				<Dialog.Description>
					Your API key has been created successfully. Copy it now - you won't be able to see it
					again!
				</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-4">
				<div class="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-950">
					<p class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
						⚠️ Save this key securely
					</p>
					<p class="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
						You won't be able to view this key again after closing this dialog.
					</p>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium">Your API Key</label>
					<div class="flex gap-2">
						<Input value={createdKey.key} readonly class="font-mono text-sm" />
						<Button
							type="button"
							variant="outline"
							size="icon"
							onclick={copyToClipboard}
							title="Copy to clipboard"
						>
							{#if copied}
								<CheckIcon class="h-4 w-4 text-green-600" />
							{:else}
								<CopyIcon class="h-4 w-4" />
							{/if}
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">
						Key for: {createdKey.name ?? 'Unnamed'}
					</p>
				</div>

				<Dialog.Footer>
					<Button type="button" onclick={handleDone}>Done</Button>
				</Dialog.Footer>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
