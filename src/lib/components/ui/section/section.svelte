<script lang="ts">
	import { Wrapper, type WrapperProps } from '$lib/components/ui/wrapper';
	import { cn } from '$lib/utils/ui.js';

	let { children, class: className, gap = 'md', ...restProps }: WrapperProps = $props();
</script>

<Wrapper
	{gap}
	class={cn('items-start gap-x-6 md:grid md:grid-cols-3 lg:gap-x-8', className)}
	{...restProps}
>
	{@render children?.()}
</Wrapper>
