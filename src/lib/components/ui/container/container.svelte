<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils/ui.js';

	export const containerVariants = tv({
		base: 'relative w-full max-w-272 mx-auto px-6 lg:px-8'
	});

	export type ContainerProps = WithElementRef<HTMLAttributes<HTMLDivElement>> &
		VariantProps<typeof containerVariants> & {
			child?: Snippet<[{ props: HTMLAttributes<HTMLDivElement> }]>;
		};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		child,
		children,
		...restProps
	}: ContainerProps = $props();

	const attrs = $derived({
		class: cn(containerVariants(), className),

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
