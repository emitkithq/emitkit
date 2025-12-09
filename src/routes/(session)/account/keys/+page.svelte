<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { getPageActionsContext } from '$lib/context/page-actions.svelte';
	import { useModals } from '$lib/components/modal-stack/modal-stack-provider.svelte';
	import ApiKeysList from '$lib/features/api-keys/components/api-keys-list.svelte';
	import CreateApiKeyButton from '$lib/features/api-keys/components/create-api-key-button.svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { listApiKeysWithProjects } from '$lib/features/api-keys/api-keys.client';
	import type { ApiKeyWithProject } from '$lib/features/api-keys/types';

	let { data }: { data: PageData } = $props();

	const ownerId = Symbol('api-keys-page');
	const pageActions = getPageActionsContext();
	const modals = useModals();

	let apiKeys = $state<ApiKeyWithProject[]>([]);
	let loading = $state(true);

	async function loadApiKeys() {
		loading = true;
		try {
			apiKeys = await listApiKeysWithProjects(data.projects);
		} catch (error) {
			console.error('Failed to load API keys:', error);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadApiKeys();

		if (data.projects.length > 0) {
			pageActions.registerRight(ownerId, [
				{
					component: CreateApiKeyButton,
					props: {
						onclick: handleCreateApiKey
					}
				}
			]);
		}

		return () => {
			pageActions.unregister(ownerId);
		};
	});

	async function handleCreateApiKey() {
		const modal = modals.push('createApiKey', {
			props: {
				projects: data.projects,
				organizationId: data.organizationId,
				userId: data.userId
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			await loadApiKeys();
		}
	}

	async function handleDeleteApiKey(keyId: string) {
		const apiKey = apiKeys.find((k) => k.id === keyId);

		if (!apiKey) return;

		const partialKey =
			apiKey.prefix && apiKey.start ? `${apiKey.prefix}${apiKey.start}****...` : '****...';

		const modal = modals.push('deleteApiKey', {
			props: {
				keyId,
				keyName: apiKey.name || 'Unnamed Key',
				partialKey
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			await loadApiKeys();
		}
	}
</script>

<!-- No projects state -->
{#if data.projects.length === 0}
	<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
		<div
			class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			<KeyRoundIcon class="h-6 w-6" />
		</div>
		<h3 class="mt-4 text-lg font-semibold">No projects yet</h3>
		<p class="mt-2 text-center text-sm text-muted-foreground">
			You need to create a project before you can generate API keys.<br />
			API keys are scoped to specific projects.
		</p>
		<Button href="/projects" class="mt-4" variant="outline">Go to Projects</Button>
	</div>
{:else if loading}
	<div class="flex items-center justify-center p-12">
		<p class="text-sm text-muted-foreground">Loading API keys...</p>
	</div>
{:else}
	<ApiKeysList {apiKeys} onDelete={handleDeleteApiKey} />
{/if}
