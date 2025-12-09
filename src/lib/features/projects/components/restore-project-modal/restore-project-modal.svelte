<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { restoreProjectCommand } from '$lib/features/projects/projects.remote';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import InfoIcon from '@lucide/svelte/icons/info';

	// Props interface
	interface Props {
		projectId: string;
		organizationId: string;
		projectName: string;
	}

	// Component props with StackItemProps for modal integration
	let {
		item,
		projectId,
		organizationId,
		projectName
	}: StackItemProps<{ success: boolean }> & Props = $props();

	let isRestoring = $state(false);
	let error = $state<string | null>(null);

	// Handle cancel
	function handleCancel() {
		item.resolve({ success: false });
	}

	// Handle restore
	async function handleRestore() {
		isRestoring = true;
		error = null;

		try {
			await restoreProjectCommand({
				projectId,
				organizationId
			});

			item.resolve({ success: true });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to restore project';
			isRestoring = false;
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[500px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<InfoIcon class="size-5" />
				Restore Project
			</Dialog.Title>
			<Dialog.Description>
				Restore this archived project and make it accessible again. All channels and API keys will
				be restored.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3 py-4">
			<!-- Info Alert -->
			<Alert.Root>
				<InfoIcon class="size-4" />
				<Alert.Title>Restoring "{projectName}" will:</Alert.Title>
				<Alert.Description class="mt-2 space-y-2">
					<ul class="list-inside list-disc space-y-1 text-sm">
						<li><strong>Restore all channels</strong> associated with this project</li>
						<li><strong>Re-enable API keys</strong> for API access</li>
						<li><strong>Make all data accessible</strong> again</li>
					</ul>
				</Alert.Description>
			</Alert.Root>

			<!-- Error Display -->
			{#if error}
				<Alert.Root variant="destructive">
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={handleCancel} disabled={isRestoring}>
				Cancel
			</Button>
			<Button type="button" onclick={handleRestore} disabled={isRestoring}>
				{isRestoring ? 'Restoring...' : 'Restore Project'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
