<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils/ui.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const sectionSidebarVariants = tv({
		base: 'flex flex-col md:col-span-1',
		variants: {
			gap: {
				micro: 'gap-y-fluid-micro',
				xxs: 'gap-y-fluid-xxs',
				xs: 'gap-y-fluid-xs',
				sm: 'gap-y-fluid-sm',
				md: 'gap-y-fluid-md',
				lg: 'gap-y-fluid-lg',
				xl: 'gap-y-fluid-xl'
			}
		},
		defaultVariants: {
			gap: 'md'
		}
	});

	export type SectionSidebarVariant = VariantProps<typeof sectionSidebarVariants>;

	export type SectionSidebarProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		gap?: SectionSidebarVariant['gap'];
		sticky?: boolean;
		animate?: boolean;
		animateDelay?: number;
	};
</script>

<script lang="ts">
	import { Sticky } from '$lib/components/ui/sticky';
	import { motion, animations } from '$lib/utils/motion';

	let {
		children,
		class: className,
		gap = 'md',
		sticky = true,
		ref = $bindable(null),
		animate,
		animateDelay,
		...restProps
	}: SectionSidebarProps = $props();
</script>

{#if sticky}
	<Sticky>
		<aside
			bind:this={ref}
			class={cn(sectionSidebarVariants({ gap }), className)}
			{...restProps}
			use:motion={animate ? animations.fadeInUp(animateDelay) : undefined}
		>
			{@render children?.()}
		</aside>
	</Sticky>
{:else}
	<aside
		bind:this={ref}
		class={cn(sectionSidebarVariants({ gap }), className)}
		{...restProps}
		use:motion={animate ? animations.fadeInUp(animateDelay) : undefined}
	>
		{@render children?.()}
	</aside>
{/if}
