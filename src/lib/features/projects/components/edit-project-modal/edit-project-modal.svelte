<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { orpc } from '$lib/config/rpc-client';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import XIcon from '@lucide/svelte/icons/x';

	// Props interface
	interface Props {
		projectId: string;
		organizationId: string;
		currentName: string;
		currentUrl?: string | null;
	}

	// Component props with StackItemProps for modal integration
	let {
		item,
		projectId,
		organizationId,
		currentName,
		currentUrl = null
	}: StackItemProps<{ success: boolean; folderName?: string; folderUrl?: string | null }> &
		Props = $props();

	// Form state — intentionally capturing initial prop values
	// svelte-ignore state_referenced_locally
	let name = $state(currentName);
	// svelte-ignore state_referenced_locally
	let url = $state(currentUrl || '');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Handle cancel
	function handleCancel() {
		item.resolve({ success: false });
	}

	// Handle clear URL
	function handleClearUrl() {
		url = '';
	}

	// Handle submit
	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		if (!name || name.trim().length < 1) {
			error = 'Project name is required';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			await orpc.projects.updateForm({
				projectId,
				organizationId,
				name: name.trim(),
				url: url || undefined
			});

			item.resolve({
				success: true,
				folderName: name.trim(),
				folderUrl: url || null
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update project';
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Edit Folder</Dialog.Title>
			<Dialog.Description>
				Update your folder's name and optionally associate a website URL to display its favicon.
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-6">
			<!-- Error Display -->
			{#if error}
				<Alert.Root variant="destructive">
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			<Field.Group>
				<!-- Folder Name -->
				<Field.Field>
					<Field.Label for="folder-name">Folder Name *</Field.Label>
					<Input id="folder-name" placeholder="Enter project name" bind:value={name} />
					<Field.Description>Choose a descriptive name for your folder</Field.Description>
				</Field.Field>

				<!-- Website URL -->
				<Field.Field>
					<Field.Label for="folder-url">Website URL</Field.Label>
					<div class="relative">
						<Input id="folder-url" placeholder="https://example.com" bind:value={url} />
						{#if url}
							<button
								type="button"
								onclick={handleClearUrl}
								class="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 hover:bg-accent"
								aria-label="Clear URL"
							>
								<XIcon class="size-4" />
							</button>
						{/if}
					</div>
					<Field.Description>
						Optional: Add a website URL to display its favicon in the folder list
					</Field.Description>
				</Field.Field>
			</Field.Group>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : 'Save Changes'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
