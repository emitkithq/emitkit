<script lang="ts">
	import { Laptop, Moon, Sun } from '@lucide/svelte';
	import { mode, setMode } from 'mode-watcher';
	import { onMount } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { cn } from '$lib/utils/ui.js';

	type ThemeSwitcherProps = HTMLButtonAttributes & {
		class?: string;
	};

	let { class: className }: ThemeSwitcherProps = $props();

	const themes = ['light', 'dark', 'system'] as const;
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	const getThemeIcon = (theme: string) => {
		switch (theme) {
			case 'light':
				return Sun;
			case 'dark':
				return Moon;
			default:
				return Laptop;
		}
	};

	const capitalCase = (str: string) => {
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	const currentMode = $derived(mode.current ?? 'system');
	const CurrentIcon = $derived(getThemeIcon(currentMode));
</script>

{#if mounted}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger class={cn('outline-none', className)}>
			<CurrentIcon class="size-4" />
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="start">
			{#each themes as theme (theme)}
				{@const ThemeIcon = getThemeIcon(theme)}
				<DropdownMenu.Item onclick={() => setMode(theme)}>
					<ThemeIcon class="mr-2 size-4" />
					{capitalCase(theme)}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
