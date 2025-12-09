<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils/ui.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		title,
		description,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title?: string;
		description?: string;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="field-group"
	class={cn(
		'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4',
		className
	)}
	{...restProps}
>
	{#if title || description}
		<div class="flex flex-col gap-1 border-b border-foreground/20 pb-4">
			{#if title}
				<h3 class="text-lg font-medium text-foreground">{title}</h3>
			{/if}
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
	{/if}
	{@render children?.()}
</div>
