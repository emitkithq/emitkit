<script lang="ts">
	import type { EventListItem } from '$lib/features/events/types.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { motion, animations } from '$lib/utils/motion.js';

	let { metadata }: { metadata: EventListItem['metadata'] } = $props();

	// Track expansion state for each long string field
	let expandedFields = $state<Record<string, boolean>>({});
	const stringTruncateLength = 100;
</script>

<dl class="grid gap-3">
	{#each Object.entries(metadata) as [key, value], index (key)}
		<div class="grid gap-1" use:motion={animations.fadeInUp(index * 0.04)}>
			<dt class="text-xs font-medium text-foreground/70">
				{key
					.replace(/([A-Z])/g, ' $1')
					.replace(/^./, (str) => str.toUpperCase())
					.trim()}
			</dt>
			<dd class="text-sm">
				{#if value === null}
					<span class="text-muted-foreground italic">null</span>
				{:else if value === undefined}
					<span class="text-muted-foreground italic">undefined</span>
				{:else if typeof value === 'boolean'}
					<Badge variant={value ? 'default' : 'outline'} class="font-mono">
						{value}
					</Badge>
				{:else if typeof value === 'number'}
					<span class="font-mono text-blue-600 dark:text-blue-400">{value}</span>
				{:else if typeof value === 'string'}
					{#if value.startsWith('http://') || value.startsWith('https://')}
						<a
							href={value}
							target="_blank"
							rel="noopener noreferrer"
							class="text-primary underline-offset-4 hover:underline"
						>
							{value}
						</a>
					{:else if value.length > stringTruncateLength}
						<div class="text-foreground">
							{#if expandedFields[key]}
								<span class="wrap-break-word whitespace-pre-wrap">
									{value}
									<button
										onclick={() => (expandedFields[key] = false)}
										class="ml-1 font-medium text-primary hover:underline"
									>
										less
									</button>
								</span>
							{:else}
								<span class="line-clamp-1">
									{value.slice(0, stringTruncateLength)}...
									<button
										onclick={() => (expandedFields[key] = true)}
										class="ml-1 font-medium text-primary hover:underline"
									>
										more
									</button>
								</span>
							{/if}
						</div>
					{:else}
						<span class="text-foreground">{value}</span>
					{/if}
				{:else if Array.isArray(value)}
					<div class="flex flex-wrap gap-1.5">
						{#each value as item, itemIndex (itemIndex)}
							<Badge variant="secondary" class="text-xs font-normal">
								{typeof item === 'object' ? JSON.stringify(item) : String(item)}
							</Badge>
						{/each}
					</div>
				{:else if typeof value === 'object'}
					<details class="group">
						<summary
							class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
						>
							View
						</summary>
						<pre
							class="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(
								value,
								null,
								2
							)}</pre>
					</details>
				{:else}
					<span class="text-muted-foreground">{String(value)}</span>
				{/if}
			</dd>
		</div>
	{/each}
</dl>
