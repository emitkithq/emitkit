<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils/ui.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
		alignment?: 'left' | 'center' | 'right';
		child?: Snippet<[{ props: HTMLAttributes<HTMLDivElement> }]>;
	};

	let {
		children,
		alignment = 'left',
		class: className,
		child,
		ref,
		...restProps
	}: Props = $props();

	const alignmentClasses = {
		left: 'text-left items-start',
		center: 'text-center items-center',
		right: 'text-right items-end'
	};

	const attrs = $derived({
		class: cn('flex flex-col gap-y-4', alignmentClasses[alignment], className),
		...restProps
	});
</script>

{#if child}
	{@render child({ props: attrs })}
{:else}
	<div bind:this={ref} {...attrs}>
		{@render children?.()}
	</div>
{/if}
