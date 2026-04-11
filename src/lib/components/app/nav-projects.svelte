<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import HashIcon from '@lucide/svelte/icons/hash';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { FolderActionsMenu } from '$lib/components/app/project-actions';
	import FolderFavicon from '$lib/components/app/folder-favicon.svelte';
	import { api } from '$lib/config/rpc-client';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { useCurrentOrganization } from 'better-auth-ui-svelte';
	import { useModals } from '$lib/components/modal-stack/modal-stack-provider.svelte';
	import { page } from '$app/state';
	import type { Project } from '$lib/features/projects/types';
	import type { Channel } from '$lib/server/db/schema/channel';
	import { SvelteSet } from 'svelte/reactivity';

	const organization = useCurrentOrganization();
	const modals = useModals();
	const queryClient = useQueryClient();

	// Expansion strategy types
	type ExpansionStrategy = 'EXPAND_ALL' | 'EXPAND_ACTIVE_AND_SMALL' | 'EXPAND_ACTIVE_ONLY';

	function calculateExpansionStrategy(
		projects: Project[],
		channels: Record<string, { items: Channel[]; loading: boolean }>
	): ExpansionStrategy {
		const totalProjects = projects.length;
		const totalChannels = Object.values(channels).reduce((sum, ch) => sum + ch.items.length, 0);
		const maxChannelsInProject = Math.max(
			...Object.values(channels).map((ch) => ch.items.length),
			0
		);

		if (totalProjects <= 3 && totalChannels <= 12) return 'EXPAND_ALL';
		if (totalProjects <= 6 && maxChannelsInProject <= 8) return 'EXPAND_ACTIVE_AND_SMALL';
		return 'EXPAND_ACTIVE_ONLY';
	}

	function calculateOpenProjects(
		strategy: ExpansionStrategy,
		projects: Project[],
		channels: Record<string, { items: Channel[]; loading: boolean }>,
		activeProjectId: string | undefined,
		userOverrides: Record<string, boolean>
	): SvelteSet<string> {
		const openSet = new SvelteSet<string>();

		switch (strategy) {
			case 'EXPAND_ALL':
				projects.forEach((p) => openSet.add(p.id));
				break;
			case 'EXPAND_ACTIVE_AND_SMALL':
				projects.forEach((p) => {
					const channelCount = channels[p.id]?.items.length || 0;
					if (p.id === activeProjectId || channelCount <= 3) openSet.add(p.id);
				});
				break;
			case 'EXPAND_ACTIVE_ONLY':
				if (activeProjectId) openSet.add(activeProjectId);
				break;
		}

		Object.entries(userOverrides).forEach(([projectId, shouldBeOpen]) => {
			if (shouldBeOpen) openSet.add(projectId);
			else openSet.delete(projectId);
		});

		return openSet;
	}

	// TanStack Query — cached, deduplicated, stale-while-revalidate
	const orgId = $derived(organization.data?.id);

	const projectsQuery = createQuery(() => ({
		...api.projects.list.queryOptions({ input: { organizationId: orgId!, page: 1, limit: 50 } }),
		enabled: !!orgId
	}));

	const channelsQuery = createQuery(() => ({
		...api.channels.listByOrg.queryOptions({
			input: { organizationId: orgId!, page: 1, limit: 200 }
		}),
		enabled: !!orgId
	}));

	const deletedQuery = createQuery(() => ({
		...api.projects.listDeleted.queryOptions({
			input: { organizationId: orgId!, page: 1, limit: 50 }
		}),
		enabled: !!orgId
	}));

	// Derive data from queries
	const projectsData = $derived(projectsQuery.data?.items ?? []);
	const deletedProjectsData = $derived(deletedQuery.data?.items ?? []);

	// Group channels by projectId
	const projectChannels = $derived.by(() => {
		const channels: Record<string, { items: Channel[]; loading: boolean }> = {};
		for (const project of projectsData) {
			channels[project.id] = { items: [], loading: false };
		}
		if (channelsQuery.data?.items) {
			for (const channel of channelsQuery.data.items) {
				if (channels[channel.projectId]) {
					channels[channel.projectId].items.push(channel);
				}
			}
		}
		return channels;
	});

	// State to track user manual toggles
	let userOverrides = $state<Record<string, boolean>>({});

	// Reset user overrides when organization changes
	$effect(() => {
		if (orgId) {
			userOverrides = {};
		}
	});

	// DERIVED: Compute which projects should be open
	let openProjects = $derived.by(() => {
		const strategy = calculateExpansionStrategy(projectsData, projectChannels);
		const activeProjectId = page.params.project_id;
		return calculateOpenProjects(
			strategy,
			projectsData,
			projectChannels,
			activeProjectId,
			userOverrides
		);
	});

	let showDeletedProjects = $state(false);

	function invalidateSidebar() {
		if (!orgId) return;
		queryClient.invalidateQueries({
			queryKey: api.projects.list.key({ input: { organizationId: orgId, page: 1, limit: 50 } })
		});
		queryClient.invalidateQueries({
			queryKey: api.channels.listByOrg.key({
				input: { organizationId: orgId, page: 1, limit: 200 }
			})
		});
		queryClient.invalidateQueries({
			queryKey: api.projects.listDeleted.key({
				input: { organizationId: orgId, page: 1, limit: 50 }
			})
		});
	}

	function toggleProject(projectId: string) {
		const currentlyOpen = openProjects.has(projectId);
		userOverrides[projectId] = !currentlyOpen;
		userOverrides = { ...userOverrides };
	}

	async function handleNewChannel(projectId: string) {
		if (!organization.data) return;

		const modal = modals.push('channel', {
			props: { organizationId: organization.data.id, projectId }
		});

		const result = await modal.resolution;
		if (result && result.success) {
			invalidateSidebar();
		}
	}

	async function handleEditProject(
		projectId: string,
		currentName: string,
		currentUrl: string | null
	) {
		if (!organization.data) return;

		const modal = modals.push('editProject', {
			props: { projectId, organizationId: organization.data.id, currentName, currentUrl }
		});

		const result = await modal.resolution;
		if (result && result.success) invalidateSidebar();
	}

	async function handleDeleteProject(projectId: string, projectName: string) {
		if (!organization.data) return;

		const modal = modals.push('deleteProject', {
			props: { projectId, organizationId: organization.data.id, projectName }
		});

		const result = await modal.resolution;
		if (result && result.success) invalidateSidebar();
	}

	async function handleRestoreProject(event: MouseEvent, projectId: string, projectName: string) {
		event.preventDefault();
		event.stopPropagation();
		if (!organization.data) return;

		const modal = modals.push('restoreProject', {
			props: { projectId, organizationId: organization.data.id, projectName }
		});

		const result = await modal.resolution;
		if (result && result.success) invalidateSidebar();
	}

	async function handleCreateProject() {
		if (!organization.data) return;

		const modal = modals.push('createProject', {
			props: { organizationId: organization.data.id }
		});

		const result = await modal.resolution;
		if (result && result.success) invalidateSidebar();
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel class="flex items-center justify-between">
		<span>Projects & Channels</span>
		<button
			type="button"
			onclick={handleCreateProject}
			class="rounded-md p-1 hover:bg-accent"
			aria-label="Create new project"
		>
			<PlusIcon class="size-4" />
		</button>
	</Sidebar.GroupLabel>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each projectsData as project (project.id)}
				<Collapsible.Root
					open={openProjects.has(project.id)}
					onOpenChange={() => toggleProject(project.id)}
					class="group/collapsible"
				>
					<Sidebar.MenuItem>
						<div class="flex w-full items-center gap-1">
							<Collapsible.Trigger class="flex-1">
								{#snippet child({ props })}
									<Sidebar.MenuButton {...props} class="w-full">
										<ChevronRightIcon
											class="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
										<FolderFavicon url={project.url} size="sm" />
										<span class="flex-1 text-left">{project.name}</span>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>

							<FolderActionsMenu
								{project}
								onEdit={handleEditProject}
								onNewChannel={handleNewChannel}
								onDelete={handleDeleteProject}
							/>
						</div>
						<Collapsible.Content>
							<Sidebar.MenuSub>
								{#if projectChannels[project.id]?.loading}
									<Sidebar.MenuSubItem>
										<span class="text-sm text-muted-foreground">Loading channels...</span>
									</Sidebar.MenuSubItem>
								{:else if projectChannels[project.id]?.items?.length > 0}
									{#each projectChannels[project.id].items as channel (channel.id)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton
												isActive={page.url.pathname === `/events/${project.id}/${channel.id}`}
											>
												{#snippet child({ props })}
													<a
														href="/events/{project.id}/{channel.id}"
														{...props}
														class="flex items-center gap-1"
													>
														<HashIcon class="size-4" />
														<span>{channel.name}</span>
													</a>
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								{:else if projectChannels[project.id]}
									<Sidebar.MenuSubItem>
										<span class="text-sm text-muted-foreground">No channels yet</span>
									</Sidebar.MenuSubItem>
								{/if}
							</Sidebar.MenuSub>
						</Collapsible.Content>
					</Sidebar.MenuItem>
				</Collapsible.Root>
			{/each}

			{#if deletedProjectsData.length > 0}
				<Collapsible.Root bind:open={showDeletedProjects} class="group/archived-collapsible mt-4">
					<Sidebar.MenuItem>
						<Collapsible.Trigger class="flex-1">
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} class="w-full text-muted-foreground">
									<ChevronRightIcon
										class="transition-transform duration-200 group-data-[state=open]/archived-collapsible:rotate-90"
									/>
									<FolderIcon class="size-4" />
									<span class="flex-1 text-left"
										>Archived Projects ({deletedProjectsData.length})</span
									>
								</Sidebar.MenuButton>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content>
							<Sidebar.MenuSub>
								{#each deletedProjectsData as project (project.id)}
									<Sidebar.MenuSubItem>
										<div class="flex w-full items-center gap-2">
											<div class="flex flex-1 items-center gap-2 opacity-60">
												<FolderFavicon url={project.url} size="sm" />
												<span>{project.name}</span>
											</div>
											<button
												type="button"
												class="rounded-md p-1 hover:bg-accent"
												onclick={(e) => handleRestoreProject(e, project.id, project.name)}
												aria-label="Restore project"
											>
												<span class="text-xs">Restore</span>
											</button>
										</div>
									</Sidebar.MenuSubItem>
								{/each}
							</Sidebar.MenuSub>
						</Collapsible.Content>
					</Sidebar.MenuItem>
				</Collapsible.Root>
			{/if}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
