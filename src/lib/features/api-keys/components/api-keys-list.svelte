<script lang="ts">
	import type { ApiKeyWithProject } from '../types';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import KeyIcon from '@lucide/svelte/icons/key';

	interface Props {
		apiKeys: ApiKeyWithProject[];
		onDelete: (keyId: string) => void;
	}

	let { apiKeys, onDelete }: Props = $props();

	function formatDate(date: Date | null): string {
		if (!date) return 'Never';
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 30) return `${diffDays}d ago`;
		return d.toLocaleDateString();
	}

	function formatPartialKey(prefix: string | null, start: string | null): string {
		if (prefix && start) {
			return `${start}...`;
		}

		return `${prefix}...`;
	}
</script>

{#if apiKeys.length === 0}
	<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
		<div
			class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			<KeyIcon class="h-6 w-6" />
		</div>
		<h3 class="mt-4 text-lg font-semibold">No API keys yet</h3>
		<p class="mt-2 text-sm text-muted-foreground">
			Create your first API key to start using the API.
		</p>
	</div>
{:else}
	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Key</Table.Head>
					<Table.Head>Project</Table.Head>
					<Table.Head>Last Used</Table.Head>
					<Table.Head>Created</Table.Head>
					<Table.Head class="w-[100px]">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each apiKeys as apiKey (apiKey.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							{apiKey.name || 'Unnamed Key'}
						</Table.Cell>
						<Table.Cell>
							<code class="rounded bg-muted px-2 py-1 text-xs">
								{formatPartialKey(apiKey.prefix, apiKey.start)}
							</code>
						</Table.Cell>
						<Table.Cell>
							{#if apiKey.project}
								<div class="flex flex-col">
									<span class="font-medium">{apiKey.project.name}</span>
								</div>
							{:else}
								<span class="text-muted-foreground">No project</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">
							{formatDate(apiKey.lastRequest)}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">
							{formatDate(apiKey.createdAt)}
						</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon-sm"
								onclick={() => onDelete(apiKey.id)}
								title="Delete API key"
							>
								<TrashIcon class="h-4 w-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}
