<script lang="ts">
	import HashIcon from '@lucide/svelte/icons/hash';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { listChannelsQuery } from '$lib/features/channels/channels.remote';
	import { useCurrentOrganization } from 'better-auth-ui-svelte';

	const organization = useCurrentOrganization();

	const channelsQuery = $derived.by(() => {
		if (!organization.data) {
			return Promise.resolve({ items: [], total: 0 });
		}

		return listChannelsQuery({ organizationId: organization.data?.id, page: 1, limit: 50 });
	});
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Channels</Sidebar.GroupLabel>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#await channelsQuery then channels}
				{#each channels.items as channel (channel.id)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/{channel.projectId}/{channel.id}" {...props}>
									<HashIcon />

									<span>{channel.name}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			{:catch error}
				<div class="text-red-500">Error loading channels: {error.message}</div>
			{/await}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
