<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { createProjectCommand } from '$lib/features/projects/projects.remote';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { useCurrentOrganization } from 'better-auth-ui-svelte';
	import { authClient } from '$lib/client/auth/auth-client';
	import { fromStore } from '$lib/utils/store-to-rune.svelte';

	// Props interface
	interface Props {
		organizationId?: string;
		userId?: string;
	}

	// Component props with StackItemProps for modal integration
	let {
		item,
		organizationId: propOrgId,
		userId: propUserId
	}: StackItemProps<{ success: boolean; projectId?: string }> & Props = $props();

	const organization = useCurrentOrganization();
	const session = fromStore(authClient.useSession());

	// Get organization and user IDs from props or current context
	const organizationId = $derived(propOrgId ?? organization.data?.id ?? '');
	const userId = $derived(propUserId ?? session.value?.data?.user?.id ?? '');

	// State
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Form state
	let form = $state({
		name: '',
		slug: '',
		url: '',
		description: ''
	});

	// Handle cancel
	function handleCancel() {
		item.resolve({ success: false });
	}

	// Auto-generate slug
	function autoGenerateSlug() {
		form.slug = form.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	// Handle submit
	async function handleSubmit() {
		if (!form.name || !form.slug) {
			error = 'Name and slug are required';
			return;
		}

		if (!organizationId || !userId) {
			error = 'Organization and user are required';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			const result = await createProjectCommand({
				organizationId,
				userId,
				name: form.name,
				slug: form.slug,
				url: form.url || undefined,
				description: form.description || undefined
			});

			item.resolve({
				success: true,
				projectId: result.project.id
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create project';
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="flex max-h-[80dvh] flex-col p-0 sm:max-w-[425px]">
		<Dialog.Header class="shrink-0 px-6 pt-6">
			<Dialog.Title>Create New Project</Dialog.Title>
			<Dialog.Description>
				Create a project for your application. An API key will be generated automatically.
			</Dialog.Description>
		</Dialog.Header>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="flex min-h-0 flex-1 flex-col"
		>
			<div class="flex-1 overflow-y-auto px-6 py-4">
				<!-- Error Display -->
				{#if error}
					<Alert.Root variant="destructive" class="mb-6">
						<Alert.Title>Error</Alert.Title>
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}

				<Field.Group>
					<!-- Project Name -->
					<Field.Field>
						<Field.Label for="project-name">Project Name *</Field.Label>
						<Input
							id="project-name"
							bind:value={form.name}
							placeholder="My Awesome App"
							onblur={autoGenerateSlug}
							required
						/>
						<Field.Description>Choose a descriptive name for your project</Field.Description>
					</Field.Field>

					<!-- Slug -->
					<Field.Field>
						<Field.Label for="project-slug">Slug *</Field.Label>
						<div class="flex gap-2">
							<Input
								id="project-slug"
								bind:value={form.slug}
								placeholder="my-awesome-app"
								required
								class="flex-1"
							/>
							<Button type="button" variant="outline" onclick={autoGenerateSlug}>Auto</Button>
						</div>
						<Field.Description>
							Used in URLs. Only lowercase letters, numbers, and hyphens.
						</Field.Description>
					</Field.Field>

					<!-- Website URL -->
					<Field.Field>
						<Field.Label for="project-url">Website URL</Field.Label>
						<Input id="project-url" bind:value={form.url} placeholder="https://example.com" />
						<Field.Description>
							Optional: Add a website URL to display its favicon in the project list
						</Field.Description>
					</Field.Field>

					<!-- Description -->
					<Field.Field>
						<Field.Label for="project-description">Description</Field.Label>
						<Textarea
							id="project-description"
							bind:value={form.description}
							placeholder="Describe this project..."
							rows={3}
						/>
						<Field.Description>Optional: Describe what this project is for</Field.Description>
					</Field.Field>
				</Field.Group>
			</div>

			<Dialog.Footer class="shrink-0 px-6 pb-6">
				<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting || !form.name || !form.slug}>
					{isSubmitting ? 'Creating...' : 'Create Project'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
