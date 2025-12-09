<script lang="ts">
	import { Heading, type HeadingProps } from '$lib/components/ui/heading';

	type Props = HeadingProps;

	let { size = 'pageTitle', class: className, children, ...restProps }: Props = $props();
</script>

<Heading {size} class={className} {...restProps} animate={true}>
	{@render children?.()}
</Heading>
