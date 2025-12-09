<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import HashIcon from '@lucide/svelte/icons/hash';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { FolderActionsMenu } from '$lib/components/app/project-actions';
	import FolderFavicon from '$lib/components/app/folder-favicon.svelte';
	import {
		listProjectsQuery,
		listDeletedProjectsQuery
	} from '$lib/features/projects/projects.remote';
	import { listChannelsByFolderQuery } from '$lib/features/channels/channels.remote';
	import { useCurrentOrganization } from 'better-auth-ui-svelte';
	import { useModals } from '$lib/components/modal-stack/modal-stack-provider.svelte';
	import { page } from '$app/state';
	import type { Project } from '$lib/features/projects/types';
	import type { Channel } from '$lib/server/db/schema/channel';

	const organization = useCurrentOrganization();
	const modals = useModals();

	// Expansion strategy types
	type ExpansionStrategy = 'EXPAND_ALL' | 'EXPAND_ACTIVE_AND_SMALL' | 'EXPAND_ACTIVE_ONLY';

	// Helper function: Calculate expansion strategy based on content density
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

		// Small content: expand everything (2-3 projects, 1-4 channels each)
		if (totalProjects <= 3 && totalChannels <= 12) {
			return 'EXPAND_ALL';
		}

		// Medium content: expand active + small projects
		if (totalProjects <= 6 && maxChannelsInProject <= 8) {
			return 'EXPAND_ACTIVE_AND_SMALL';
		}

		// Large content: expand only active
		return 'EXPAND_ACTIVE_ONLY';
	}

	// Helper function: Calculate which projects should be open
	function calculateOpenProjects(
		strategy: ExpansionStrategy,
		projects: Project[],
		channels: Record<string, { items: Channel[]; loading: boolean }>,
		activeProjectId: string | undefined,
		userOverrides: Record<string, boolean>
	): Set<string> {
		const openSet = new Set<string>();

		// Start with strategy-based defaults
		switch (strategy) {
			case 'EXPAND_ALL':
				projects.forEach((p) => openSet.add(p.id));
				break;

			case 'EXPAND_ACTIVE_AND_SMALL':
				projects.forEach((p) => {
					const channelCount = channels[p.id]?.items.length || 0;
					if (p.id === activeProjectId || channelCount <= 3) {
						openSet.add(p.id);
					}
				});
				break;

			case 'EXPAND_ACTIVE_ONLY':
				if (activeProjectId) {
					openSet.add(activeProjectId);
				}
				break;
		}

		// Apply user overrides
		Object.entries(userOverrides).forEach(([projectId, shouldBeOpen]) => {
			if (shouldBeOpen) {
				openSet.add(projectId);
			} else {
				openSet.delete(projectId);
			}
		});

		return openSet;
	}

	// Reactive state for projects - we'll update this manually
	let projectsData = $state<Project[]>([]);
	let deletedProjectsData = $state<Project[]>([]);

	// Reset user overrides when organization changes
	$effect(() => {
		if (organization.data?.id) {
			userOverrides = {};
		}
	});

	// Fetch projects and all channels when organization changes
	$effect(() => {
		if (organization.data?.id) {
			listProjectsQuery({ organizationId: organization.data.id, page: 1, limit: 50 }).then(
				async (data) => {
					projectsData = data.items;

					// Preload channels for all projects
					const channelPromises = data.items.map((project) =>
						listChannelsByFolderQuery({ projectId: project.id, page: 1, limit: 50 })
							.then((result) => ({ projectId: project.id, channels: result.items }))
							.catch((error) => {
								console.error(`Failed to load channels for project ${project.id}:`, error);
								return { projectId: project.id, channels: [] };
							})
					);

					const channelsResults = await Promise.all(channelPromises);

					// Update projectChannels state
					const newChannels: Record<string, { items: Channel[]; loading: boolean }> = {};
					for (const result of channelsResults) {
						newChannels[result.projectId] = { items: result.channels, loading: false };
					}
					projectChannels = newChannels;
				}
			);
			listDeletedProjectsQuery({ organizationId: organization.data.id, page: 1, limit: 50 }).then(
				(data) => {
					deletedProjectsData = data.items;
				}
			);
		}
	});

	// State to track channels per project
	let projectChannels = $state<Record<string, { items: Channel[]; loading: boolean }>>({});

	// State to track user manual toggles
	let userOverrides = $state<Record<string, boolean>>({});

	// DERIVED: Compute which projects should be open based on content density and user overrides
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

	// Track if deleted projects section is open
	let showDeletedProjects = $state(false);

	// Helper function to refresh both active and deleted projects
	async function refreshProjects() {
		if (!organization.data?.id) return;

		const [activeProjects, archivedProjects] = await Promise.all([
			listProjectsQuery({ organizationId: organization.data.id, page: 1, limit: 50 }),
			listDeletedProjectsQuery({ organizationId: organization.data.id, page: 1, limit: 50 })
		]);

		projectsData = activeProjects.items;
		deletedProjectsData = archivedProjects.items;

		// Refresh channels for all active projects
		const channelPromises = activeProjects.items.map((project) =>
			listChannelsByFolderQuery({ projectId: project.id, page: 1, limit: 50 })
				.then((result) => ({ projectId: project.id, channels: result.items }))
				.catch((error) => {
					console.error(`Failed to load channels for project ${project.id}:`, error);
					return { projectId: project.id, channels: [] };
				})
		);

		const channelsResults = await Promise.all(channelPromises);

		// Update projectChannels state
		const newChannels: Record<string, { items: Channel[]; loading: boolean }> = {};
		for (const result of channelsResults) {
			newChannels[result.projectId] = { items: result.channels, loading: false };
		}
		projectChannels = newChannels;
	}

	// Toggle project open/closed - track user intent
	function toggleProject(projectId: string) {
		const currentlyOpen = openProjects.has(projectId);

		// Record the opposite of current state as user's preference
		userOverrides[projectId] = !currentlyOpen;

		// Trigger reactivity by reassigning
		userOverrides = { ...userOverrides };
	}

	async function handleNewChannel(projectId: string) {
		if (!organization.data) {
			console.error('No organization selected');
			return;
		}

		const modal = modals.push('channel', {
			props: {
				organizationId: organization.data.id,
				projectId: projectId
			}
		});

		const result = await modal.resolution;

		if (result && result.success && result.channelId) {
			const channelResult = await listChannelsByFolderQuery({
				projectId: projectId,
				page: 1,
				limit: 50
			});
			projectChannels[projectId] = { items: channelResult.items, loading: false };
		}
	}

	async function handleEditProject(
		projectId: string,
		currentName: string,
		currentUrl: string | null
	) {
		if (!organization.data) {
			console.error('No organization selected');
			return;
		}

		const modal = modals.push('editProject', {
			props: {
				projectId: projectId,
				organizationId: organization.data.id,
				currentName: currentName,
				currentUrl: currentUrl
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			// Refresh the projects list reactively
			await refreshProjects();
		}
	}

	async function handleDeleteProject(projectId: string, projectName: string) {
		if (!organization.data) {
			console.error('No organization selected');
			return;
		}

		const modal = modals.push('deleteProject', {
			props: {
				projectId: projectId,
				organizationId: organization.data.id,
				projectName: projectName
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			// Refresh the projects list after deletion - move to archived
			await refreshProjects();
		}
	}

	async function handleRestoreProject(event: MouseEvent, projectId: string, projectName: string) {
		event.preventDefault();
		event.stopPropagation();

		if (!organization.data) {
			console.error('No organization selected');
			return;
		}

		const modal = modals.push('restoreProject', {
			props: {
				projectId: projectId,
				organizationId: organization.data.id,
				projectName: projectName
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			// Refresh the projects list after restoration - move back to active
			await refreshProjects();
		}
	}

	async function handleCreateProject() {
		if (!organization.data) {
			console.error('No organization selected');
			return;
		}

		const modal = modals.push('createProject', {
			props: {
				organizationId: organization.data.id
			}
		});

		const result = await modal.resolution;

		if (result && result.success) {
			// Refresh the projects list after creation
			await refreshProjects();
		}
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

							<!-- Project Actions Menu -->
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

			<!-- Archived Projects Section -->
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
