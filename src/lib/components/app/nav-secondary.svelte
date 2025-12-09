<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component, ComponentProps } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	type NavItem = {
		title: string;
		url: string;
		icon: Component;
		badge?: string;
		items?: { title: string; url: string }[];
	};

	let {
		ref = $bindable(null),
		items,
		...restProps
	}: ComponentProps<typeof Sidebar.Group> & {
		items: NavItem[];
	} = $props();

	// Track which items are open
	let openItems = new SvelteSet<string>();

	function toggleItem(title: string) {
		if (openItems.has(title)) {
			openItems.delete(title);
		} else {
			openItems.add(title);
		}
		openItems = new SvelteSet(openItems);
	}
</script>

<Sidebar.Group bind:ref {...restProps}>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each items as item (item.title)}
				{#if item.items && item.items.length > 0}
					<!-- Item with submenu -->
					<Collapsible.Root
						open={openItems.has(item.title)}
						onOpenChange={() => toggleItem(item.title)}
						class="group/collapsible"
					>
						<Sidebar.MenuItem>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton {...props} class="w-full">
										<item.icon />
										<span class="flex-1 text-left">{item.title}</span>
										<ChevronRightIcon
											class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>
							{#if item.badge}
								<Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge>
							{/if}
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each item.items as subItem (subItem.title)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton>
												{#snippet child({ props })}
													<a href={subItem.url} {...props}>
														<span>{subItem.title}</span>
													</a>
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								</Sidebar.MenuSub>
							</Collapsible.Content>
						</Sidebar.MenuItem>
					</Collapsible.Root>
				{:else}
					<!-- Simple item without submenu -->
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href={item.url} {...props}>
									<item.icon />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
						{#if item.badge}
							<Sidebar.MenuBadge>{item.badge}</Sidebar.MenuBadge>
						{/if}
					</Sidebar.MenuItem>
				{/if}
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
