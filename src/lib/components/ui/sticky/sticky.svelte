<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils/ui.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const stickyVariants = tv({
		base: 'md:sticky md:z-49 md:top-20'
	});

	export type StickyVariant = VariantProps<typeof stickyVariants>;

	export type StickyProps = WithElementRef<HTMLAttributes<HTMLDivElement>>;
</script>

<script lang="ts">
	let { children, class: className, ref = $bindable(null), ...restProps }: StickyProps = $props();
</script>

<div bind:this={ref} class={cn(stickyVariants(), className)} {...restProps}>
	{@render children?.()}
</div>
