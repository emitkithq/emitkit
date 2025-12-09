<!--
	Lazy-loaded emoji picker list wrapper
	Only loads the emoji data when the component is mounted
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { EmojiPickerListProps } from './types';

	let {
		ref = $bindable(null),
		emptyMessage = 'No results.',
		class: className,
		...rest
	}: EmojiPickerListProps = $props();

	let EmojiPickerList: typeof import('./emoji-picker-list.svelte').default | null = $state(null);
	let isLoading = $state(true);

	onMount(async () => {
		// Dynamically import the emoji picker list component
		const module = await import('./emoji-picker-list.svelte');
		EmojiPickerList = module.default;
		isLoading = false;
	});
</script>

{#if isLoading}
	<div class="relative flex h-[200px] items-center justify-center">
		<div class="text-sm text-muted-foreground">Loading emojis...</div>
	</div>
{:else if EmojiPickerList}
	<EmojiPickerList bind:ref {emptyMessage} class={className} {...rest} />
{/if}
