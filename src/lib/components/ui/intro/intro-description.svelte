<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/ui.js';
	import { animations, motion } from '$lib/utils/motion';

	interface Props extends HTMLAttributes<HTMLParagraphElement> {
		children?: Snippet;
		as?: keyof HTMLElementTagNameMap;
	}

	let { children, class: className, as = 'p', ...restProps }: Props = $props();
</script>

<svelte:element
	this={as}
	class={cn(
		'max-w-md [word-break:break-word] text-muted-foreground md:text-base *:[&[href]]:underline *:[&[href]]:hover:text-primary',
		className
	)}
	{...restProps}
	use:motion={animations.fadeInUp(0.3)}
>
	{#if children}
		{@render children()}
	{/if}
</svelte:element>
