<script lang="ts">
	import { page } from '$app/state';
	import {
		listIntegrationsQuery,
		createIntegrationCommand,
		deleteIntegrationCommand
	} from '$lib/features/integrations/integrations.remote';
	import {
		AVAILABLE_INTEGRATIONS,
		getIntegrationDefinition
	} from '$lib/features/integrations/constants';
	import type { IntegrationDefinition } from '$lib/features/integrations/constants';
	import type { IntegrationWithMetadata } from '$lib/features/integrations/types';
	import {
		IntegrationCard,
		ConnectionCard,
		IntegrationLoadingState
	} from '$lib/features/integrations/components';
	import { useIntegrationModals } from '$lib/features/integrations/components/modals/integration-modal-provider.svelte';
	import { listFoldersQuery } from '$lib/features/folders/folders.remote';
	import { listChannelsQuery } from '$lib/features/channels/channels.remote';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';

	// Initialize modals at component initialization (required for Svelte 5)
	const modals = useIntegrationModals();

	let searchQuery = $state('');
	let testingIntegrationId = $state<string | null>(null);

	const organizationId = $derived(page.data.orgId || '');

	// Query integrations
	const integrationsQuery = $derived(listIntegrationsQuery({ scope: undefined }));

	// Fetch all folders and channels for lookup (max limit is 100)
	const foldersQuery = $derived(
		organizationId ? listFoldersQuery({ organizationId, page: 1, limit: 100 }) : null
	);
	const channelsQuery = $derived(
		organizationId ? listChannelsQuery({ organizationId, page: 1, limit: 100 }) : null
	);

	// Create lookup maps for folder/channel names
	const folderMap = $derived.by(() => {
		if (!foldersQuery || (typeof foldersQuery === 'object' && 'then' in foldersQuery)) {
			return new Map<string, string>();
		}
		const folders = (foldersQuery as any).items || [];
		return new Map(folders.map((f: any) => [f.id, f.name]));
	});

	const channelMap = $derived.by(() => {
		if (!channelsQuery || (typeof channelsQuery === 'object' && 'then' in channelsQuery)) {
			return new Map<string, string>();
		}
		const channels = (channelsQuery as any).items || [];
		return new Map(channels.map((c: any) => [c.id, c.name]));
	});

	// Filter available integrations by search
	const filteredAvailable = $derived.by(() => {
		if (!searchQuery) return AVAILABLE_INTEGRATIONS;
		const q = searchQuery.toLowerCase();
		return AVAILABLE_INTEGRATIONS.filter(
			(i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
		);
	});

	// Get connected integration IDs
	const connectedTypes = $derived.by(() => {
		if (
			!integrationsQuery ||
			(typeof integrationsQuery === 'object' && 'then' in integrationsQuery)
		) {
			return new Set<string>();
		}
		return new Set((integrationsQuery as any).integrations?.map((i: any) => i.type) || []);
	});

	function handleConnect(integration: IntegrationDefinition) {
		if (!organizationId) {
			toast.error('Organization ID not found');
			return;
		}

		const modalVariant = `${integration.id}-connect` as 'slack-connect' | 'discord-connect';

		const modal = modals.push(modalVariant, {
			props: {
				organizationId
			}
		});

		modal.resolution.then((result) => {
			if (result?.confirmed) {
				// Refresh the integrations list
				if (
					integrationsQuery &&
					typeof integrationsQuery === 'object' &&
					'then' in integrationsQuery
				) {
					(integrationsQuery as any).refresh?.();
				}
			}
		});
	}

	async function handleTest(integrationId: string) {
		testingIntegrationId = integrationId;

		try {
			// TODO: Implement test integration command
			await new Promise((resolve) => setTimeout(resolve, 1000));
			toast.success('Test notification sent successfully');
		} catch (error) {
			toast.error('Failed to send test notification');
			console.error(error);
		} finally {
			testingIntegrationId = null;
		}
	}

	function handleViewDetails(integrationId: string) {
		// Find the integration
		if (integrationsQuery && typeof integrationsQuery !== 'object') return;
		const integration = (integrationsQuery as any).integrations?.find(
			(i: any) => i.id === integrationId
		);
		if (!integration) return;

		const definition = getIntegrationDefinition(integration.type);
		if (!definition) return;

		const integrationWithMetadata: IntegrationWithMetadata = {
			...integration,
			definition
		};

		const modal = modals.push('details', {
			props: {
				integration: integrationWithMetadata
			}
		});

		modal.resolution.then((result) => {
			if (result?.action === 'refresh') {
				handleTest(integrationId);
			} else if (result?.action === 'disconnect') {
				handleDelete(integrationId, definition.name);
			}
		});
	}

	async function handleDelete(integrationId: string, integrationName: string) {
		const modal = modals.push('delete', {
			props: {
				integrationId,
				integrationName
			}
		});

		const result = await modal.resolution;

		if (result) {
			// Refresh the integrations list
			if (
				integrationsQuery &&
				typeof integrationsQuery === 'object' &&
				'then' in integrationsQuery
			) {
				(integrationsQuery as any).refresh?.();
			}
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold">Integrations</h1>
		<p class="text-muted-foreground">Connect external services to receive event notifications</p>
	</div>

	<!-- Search -->
	<Input
		type="search"
		placeholder="Search integrations..."
		bind:value={searchQuery}
		class="max-w-sm"
	/>

	<!-- Content -->
	{#await integrationsQuery}
		<IntegrationLoadingState />
	{:then data}
		{@const integrations = data.integrations || []}
		{@const integrationsWithMetadata = integrations
			.map((i) => ({
				...i,
				definition: getIntegrationDefinition(i.type)
			}))
			.filter((i) => i.definition !== undefined) as IntegrationWithMetadata[]}

		<!-- Connected Integrations -->
		{#if integrationsWithMetadata.length > 0}
			<section>
				<h2 class="mb-4 text-xl font-semibold">Connected Integrations</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each integrationsWithMetadata as integration (integration.id)}
						{@const folderName = integration.folderId
							? folderMap.get(integration.folderId)
							: undefined}
						{@const channelName = integration.channelId
							? channelMap.get(integration.channelId)
							: undefined}
						<ConnectionCard
							{integration}
							{folderName}
							{channelName}
							onTest={handleTest}
							onViewDetails={handleViewDetails}
							onDelete={(id) => handleDelete(id, integration.definition.name)}
							isTesting={testingIntegrationId === integration.id}
						/>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Available Integrations -->
		<section>
			<h2 class="mb-4 text-xl font-semibold">Available Integrations</h2>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each filteredAvailable as integration (integration.id)}
					<IntegrationCard
						{integration}
						isConnected={connectedTypes.has(integration.id)}
						onConnect={handleConnect}
					/>
				{/each}
			</div>
		</section>
	{:catch error}
		<p class="text-destructive">
			Error loading integrations: {error instanceof Error ? error.message : 'Unknown error'}
		</p>
	{/await}
</div>
