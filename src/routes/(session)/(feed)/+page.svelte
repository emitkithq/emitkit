<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import EventFeed from '$lib/features/events/components/event-feed.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';

	let { data }: PageProps = $props();

	// Handle project filter change
	function handleProjectChange(value: string | undefined) {
		const url = new URL($page.url);
		if (value && value !== 'all') {
			url.searchParams.set('project_id', value);
		} else {
			url.searchParams.delete('project_id');
		}
		goto(url.toString(), { replaceState: true, invalidateAll: true });
	}

	// Get current selected value ('all' if no filter)
	const selectedValue = $derived(data.selectedProjectId || 'all');

	// Get selected project for display
	const selectedProject = $derived(
		data.selectedProjectId ? data.projects.find((p) => p.id === data.selectedProjectId) : null
	);
</script>

{#if data.orgId}
	<div class="mb-8">
		<!-- Project Filter -->
		{#if data.projects.length > 1}
			<div class="mb-6 flex items-center justify-center">
				<div class="flex items-center gap-3">
					<Label for="project-filter" class="text-sm font-medium">Filter by project:</Label>
					<Select.Root
						type="single"
						value={selectedValue}
						onValueChange={(value) => handleProjectChange(value)}
					>
						<Select.Trigger id="project-filter" class="w-[200px]">
							{selectedProject?.name ?? 'All projects'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="all">All projects</Select.Item>
							{#each data.projects as project (project.id)}
								<Select.Item value={project.id}>
									{project.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
		{/if}

		<!-- Event Feed -->
		<EventFeed
			initialEvents={data.events}
			sites={data.projects}
			channels={data.channels}
			organizationId={data.orgId}
			showChannelContext={true}
		/>
	</div>
{/if}
