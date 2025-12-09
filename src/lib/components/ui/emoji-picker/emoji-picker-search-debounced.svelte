<!--
	Debounced emoji picker search for better performance
-->

<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Command as CommandPrimitive } from 'bits-ui';
	import type { EmojiPickerSearchProps } from './types';
	import { useEmojiPickerInput } from './emoji-picker.svelte.js';
	import { box } from 'svelte-toolbelt';

	let { value = $bindable(''), placeholder = 'Search', ...rest }: EmojiPickerSearchProps = $props();

	// Local input value for immediate UI feedback
	let localValue = $state(value);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Update local value immediately, but debounce the actual search
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		localValue = target.value;

		// Clear existing timer
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		// Set new timer to update actual search value
		debounceTimer = setTimeout(() => {
			value = localValue;
		}, 150); // 150ms debounce
	}

	useEmojiPickerInput({
		value: box.with(
			() => value,
			(v) => (value = v)
		)
	});
</script>

<div class="p-2">
	<div class="flex h-9 items-center rounded-md border border-input bg-input px-3 dark:bg-input/30">
		<SearchIcon class="size-4 shrink-0 opacity-50" />
		<CommandPrimitive.Input
			{...rest}
			{placeholder}
			class="flex h-10 w-full rounded-md border-none bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground hover:border-none hover:ring-0 hover:outline-none focus:ring-0 active:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
			value={localValue}
			oninput={handleInput}
		/>
	</div>
</div>
