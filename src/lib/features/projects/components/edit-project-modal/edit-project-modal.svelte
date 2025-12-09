<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { updateProjectForm } from '$lib/features/projects/projects.remote';
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

	// Create a unique form instance for this modal using a unique key
	const formKey = `edit-folder-modal-${Math.random().toString(36).substring(2, 9)}`;
	const form = updateProjectForm.for(formKey);

	// Helper to safely get field issues
	type FormField = {
		issues?: () => Array<{ message: string }> | undefined;
	};

	function getIssues(field: FormField | undefined): Array<{ message: string }> {
		return field?.issues?.() ?? [];
	}

	// Watch for pending state (pending is a counter of pending requests)
	const isPending = $derived(form.pending > 0);
	let error = $state<string | null>(null);

	// Handle cancel
	function handleCancel() {
		item.resolve({ success: false });
	}

	// Handle clear URL
	function handleClearUrl() {
		const urlInput = document.getElementById('folder-url') as HTMLInputElement;
		if (urlInput) {
			urlInput.value = '';
		}
	}

	// Watch for successful submission
	let previousPending = $state(form.pending);
	$effect(() => {
		// When form transitions from pending (1+) to not pending (0)
		if (previousPending > 0 && form.pending === 0) {
			// Check if there are no field errors (successful submission)
			const hasErrors =
				form.fields.name.issues()?.length ||
				form.fields.url?.issues?.()?.length ||
				form.fields.projectId.issues()?.length ||
				form.fields.organizationId.issues()?.length;

			if (!hasErrors) {
				// Submission was successful
				const newName = form.fields.name.value();
				const newUrl = form.fields.url?.value?.();
				item.resolve({
					success: true,
					folderName: newName,
					folderUrl: newUrl
				});
			}
		}
		previousPending = form.pending;
	});
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Edit Folder</Dialog.Title>
			<Dialog.Description>
				Update your folder's name and optionally associate a website URL to display its favicon.
			</Dialog.Description>
		</Dialog.Header>

		<form {...form} class="space-y-6">
			<!-- Hidden projectId and organizationId fields -->
			<input {...form.fields.projectId.as('text')} type="hidden" value={projectId} />
			<input {...form.fields.organizationId.as('text')} type="hidden" value={organizationId} />

			<!-- Error Display -->
			{#if error}
				<Alert.Root variant="destructive">
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			<Field.Group>
				<!-- Folder Name -->
				<Field.Field data-invalid={getIssues(form.fields.name).length > 0}>
					<Field.Label for="folder-name">Folder Name *</Field.Label>
					<Input
						id="folder-name"
						placeholder="Enter project name"
						{...form.fields.name.as('text')}
						value={currentName}
						aria-invalid={getIssues(form.fields.name).length > 0}
					/>
					<Field.Description>Choose a descriptive name for your folder</Field.Description>
					{#each getIssues(form.fields.name) as issue, i (i)}
						<Field.Error>{issue.message}</Field.Error>
					{/each}
				</Field.Field>

				<!-- Website URL -->
				<Field.Field data-invalid={getIssues(form.fields.url).length > 0}>
					<Field.Label for="folder-url">Website URL</Field.Label>
					<div class="relative">
						<Input
							id="folder-url"
							placeholder="https://example.com"
							{...form.fields.url.as('text')}
							value={currentUrl || ''}
							aria-invalid={getIssues(form.fields.url).length > 0}
						/>
						{#if currentUrl}
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
					{#each getIssues(form.fields.url) as issue, i (i)}
						<Field.Error>{issue.message}</Field.Error>
					{/each}
				</Field.Field>
			</Field.Group>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={handleCancel} disabled={isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? 'Saving...' : 'Save Changes'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
