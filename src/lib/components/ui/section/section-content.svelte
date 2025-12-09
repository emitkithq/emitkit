<script lang="ts">
	import { Wrapper, type WrapperProps } from '$lib/components/ui/wrapper';
	import { cn } from '$lib/utils/ui.js';

	let {
		children,
		class: className,
		gap = 'md',
		animate,
		animateDelay,
		...restProps
	}: WrapperProps & {
		animate?: boolean;
		animateDelay?: number;
	} = $props();
</script>

<Wrapper
	{gap}
	class={cn('items-start md:col-span-2', className)}
	{animate}
	{animateDelay}
	{...restProps}
>
	{@render children?.()}
</Wrapper>
