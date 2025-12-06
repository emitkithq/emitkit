<script lang="ts">
	import type { PageProps } from './$types';
	import type { Folder } from '$lib/features/folders/types';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import FolderFavicon from '$lib/components/app/folder-favicon.svelte';
	import { createFolderCommand, deleteFolderCommand } from '$lib/features/folders/folders.remote';

	let { data }: PageProps = $props();

	// State
	let folders = $derived(data.folders);
	let showCreateDialog = $state(false);
	let showApiKeyDialog = $state(false);
	let showDeleteDialog = $state(false);
	let selectedFolder = $state<Folder | null>(null);
	let generatedApiKey = $state<string | null>(null);
	let copied = $state(false);
	let isSubmitting = $state(false);

	// Form state
	let form = $state({
		name: '',
		slug: '',
		icon: '',
		description: ''
	});

	function resetForm() {
		form = {
			name: '',
			slug: '',
			icon: '',
			description: ''
		};
	}

	async function handleCreateFolder() {
		if (!form.name || !form.slug) return;

		isSubmitting = true;
		try {
			const result = await createFolderCommand({
				organizationId: data.organizationId,
				userId: data.userId,
				name: form.name,
				slug: form.slug,
				icon: form.icon,
				description: form.description
			});

			// Update state reactively instead of reloading
			folders = [...folders, result.folder];
			selectedFolder = result.folder;
			generatedApiKey = result.apiKey.key;
			showCreateDialog = false;
			showApiKeyDialog = true;
			resetForm();
		} catch (error) {
			console.error('Failed to create folder:', error);
			alert(error instanceof Error ? error.message : 'Failed to create folder');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteFolder() {
		if (!selectedFolder) return;

		const folderToDelete = selectedFolder;

		try {
			await deleteFolderCommand({
				folderId: folderToDelete.id,
				organizationId: data.organizationId
			});

			// Update state reactively instead of reloading
			folders = folders.filter((f) => f.id !== folderToDelete.id);
			showDeleteDialog = false;
			selectedFolder = null;
		} catch (error) {
			console.error('Failed to delete folder:', error);
			alert(error instanceof Error ? error.message : 'Failed to delete folder');
		}
	}

	async function handleCopyKey() {
		if (!generatedApiKey) return;

		try {
			await navigator.clipboard.writeText(generatedApiKey);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function autoGenerateSlug() {
		form.slug = form.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}
</script>

<div class="container mx-auto p-6">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Folders</h1>
			<p class="text-muted-foreground">
				Manage your folders and API keys. Each folder represents a different application or project.
			</p>
		</div>
		<Button onclick={() => (showCreateDialog = true)}>
			<PlusIcon class="mr-2 size-4" />
			New Folder
		</Button>
	</div>

	<!-- Folders Grid -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each folders as folder (folder.id)}
			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between">
						<div class="flex items-center gap-3">
							<FolderFavicon url={folder.url} fallbackIcon={folder.icon} size="lg" />
							<div>
								<Card.Title>{folder.name}</Card.Title>
								<p class="font-mono text-xs text-muted-foreground">/{folder.slug}</p>
							</div>
						</div>
					</div>
					{#if folder.description}
						<Card.Description>{folder.description}</Card.Description>
					{/if}
				</Card.Header>
				<Card.Content class="space-y-2">
					<p class="text-sm text-muted-foreground">Manage API keys separately via Better Auth</p>
				</Card.Content>
				<Card.Footer class="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							selectedFolder = folder;
							showDeleteDialog = true;
						}}
					>
						<TrashIcon class="size-3" />
					</Button>
				</Card.Footer>
			</Card.Root>
		{/each}
	</div>

	{#if folders.length === 0}
		<Card.Root>
			<Card.Content class="flex flex-col items-center justify-center py-12">
				<SettingsIcon class="mb-4 size-12 text-muted-foreground" />
				<h3 class="mb-2 text-lg font-semibold">No folders yet</h3>
				<p class="mb-4 text-center text-sm text-muted-foreground">
					Create your first folder to start sending events from your applications.
				</p>
				<Button onclick={() => (showCreateDialog = true)}>
					<PlusIcon class="mr-2 size-4" />
					Create Folder
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Create Folder Dialog -->
<Dialog.Root bind:open={showCreateDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create New Folder</Dialog.Title>
			<Dialog.Description>
				Create a folder for your application. An API key will be generated automatically.
			</Dialog.Description>
		</Dialog.Header>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleCreateFolder();
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="name">Folder Name</Label>
				<Input
					id="name"
					bind:value={form.name}
					placeholder="My Awesome App"
					onblur={autoGenerateSlug}
					required
				/>
			</div>

			<div class="space-y-2">
				<Label for="slug">Slug</Label>
				<div class="flex gap-2">
					<Input id="slug" bind:value={form.slug} placeholder="my-awesome-app" required />
					<Button type="button" variant="outline" onclick={autoGenerateSlug}>Auto</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Used in URLs. Only lowercase letters, numbers, and hyphens.
				</p>
			</div>

			<div class="space-y-2">
				<Label for="icon">Icon (optional)</Label>
				<Input id="icon" bind:value={form.icon} placeholder="🚀" maxlength={4} />
			</div>

			<div class="space-y-2">
				<Label for="description">Description (optional)</Label>
				<Textarea
					id="description"
					bind:value={form.description}
					placeholder="Describe this folder..."
					rows={3}
				/>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showCreateDialog = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting || !form.name || !form.slug}>
					{isSubmitting ? 'Creating...' : 'Create Folder'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- API Key Display Dialog -->
<Dialog.Root bind:open={showApiKeyDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>🔑 API Key Generated</Dialog.Title>
			<Dialog.Description>
				Copy this API key now - you won't be able to see it again!
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			{#if selectedFolder}
				<div class="rounded-lg bg-muted p-4">
					<p class="text-sm font-semibold">{selectedFolder.name}</p>
					<p class="text-xs text-muted-foreground">{selectedFolder.slug}</p>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="api-key">API Key</Label>
				<div class="flex gap-2">
					<Input id="api-key" value={generatedApiKey || ''} readonly class="font-mono text-sm" />
					<Button variant="outline" size="icon" onclick={handleCopyKey} class="shrink-0">
						{#if copied}
							<CheckIcon class="size-4 text-green-500" />
						{:else}
							<CopyIcon class="size-4" />
						{/if}
					</Button>
				</div>
			</div>

			<div class="rounded-lg bg-amber-500/10 p-4 text-sm">
				<p class="font-semibold text-amber-600 dark:text-amber-400">⚠️ Important</p>
				<p class="mt-1 text-muted-foreground">
					Store this key securely. It provides full access to send events to this folder's channels.
				</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button
				onclick={() => {
					showApiKeyDialog = false;
					generatedApiKey = null;
					selectedFolder = null;
				}}
			>
				Done
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Folder Dialog -->
<Dialog.Root bind:open={showDeleteDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Folder</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete "{selectedFolder?.name}"? This will permanently delete all
				channels and events associated with this folder.
			</Dialog.Description>
		</Dialog.Header>

		<div class="rounded-lg bg-destructive/10 p-4 text-sm">
			<p class="font-semibold text-destructive">⚠️ This action cannot be undone</p>
			<ul class="mt-2 space-y-1 text-muted-foreground">
				<li>• All channels will be deleted</li>
				<li>• All events will be deleted</li>
				<li>• API key will stop working</li>
			</ul>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showDeleteDialog = false)}>Cancel</Button>
			<Button variant="destructive" onclick={handleDeleteFolder}>Delete Folder</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
