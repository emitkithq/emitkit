<script lang="ts">
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { Project } from '$lib/features/projects/types';

	interface Props {
		project: Project;
		onEdit: (projectId: string, currentName: string, currentUrl: string | null) => void;
		onNewChannel: (projectId: string) => void;
		onDelete: (projectId: string, projectName: string) => void;
	}

	let { project, onEdit, onNewChannel, onDelete }: Props = $props();

	function handleEdit(event: MouseEvent) {
		event.stopPropagation();
		onEdit(project.id, project.name, project.url ?? null);
	}

	function handleNewChannel(event: MouseEvent) {
		event.stopPropagation();
		onNewChannel(project.id);
	}

	function handleDelete(event: MouseEvent) {
		event.stopPropagation();
		onDelete(project.id, project.name);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="rounded-md p-1 hover:bg-accent"
				aria-label="Project options"
				onclick={(e) => e.stopPropagation()}
			>
				<EllipsisVerticalIcon class="size-4" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onclick={handleEdit}>Edit project</DropdownMenu.Item>
		<DropdownMenu.Item onclick={handleNewChannel}>New Channel</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={handleDelete} class="text-destructive focus:text-destructive">
			Archive project
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
