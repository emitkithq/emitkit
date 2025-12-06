<script lang="ts">
	import HouseIcon from '@lucide/svelte/icons/house';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import { OrganizationSwitcher, UserButton } from 'better-auth-ui-svelte';
	import type { ComponentProps } from 'svelte';
	import { authClient } from '$lib/client/auth/auth-client';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	import NavFolders from './nav-folders.svelte';
	import NavMain from './nav-main.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import { Folder } from '@lucide/svelte';

	let {
		ref = $bindable(null),

		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	const data = {
		navMain: [
			{
				title: 'Feed',
				url: '/',
				icon: HouseIcon,
				isActive: true
			},
			{
				title: 'Folders',
				url: '/folders',
				icon: Folder,
				isActive: true
			},
			{
				title: 'Workflows',
				url: '/organization/workflows',
				icon: HouseIcon,
				isActive: true
			}
		],
		navSecondary: [
			{
				title: 'Settings',
				url: '/organization/settings',
				icon: Settings2Icon,
				items: [
					{
						title: 'Settings',
						url: '/organization/settings'
					},
					{
						title: 'Integrations',
						url: '/organization/integrations'
					},
					{
						title: 'Notifications',
						url: '/organization/notifications'
					}
				]
			},
			{
				title: 'Help',
				url: '#',
				icon: MessageCircleQuestionIcon
			}
		]
	};
</script>

<Sidebar.Root bind:ref class="border-r-0" {...restProps}>
	<Sidebar.Header>
		<OrganizationSwitcher
			hidePersonal={true}
			classNames={{
				trigger: {
					base: 'peer/menu-button text-foreground-sidebar outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground group-has-data-[sidebar=menu-action]/menu-item:pr-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm transition-[width,height,padding] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:font-medium [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 bg-sidebar data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
				}
			}}
		/>
		<NavMain items={data.navMain} />
	</Sidebar.Header>
	<Sidebar.Content>
		<NavFolders />
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<div class="space-y-2">
			<UserButton
				size="lg"
				classNames={{
					trigger: {
						base: "peer/menu-button [&>svg]:shrink-0' flex w-full items-center gap-2 overflow-hidden rounded-md bg-sidebar p-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4"
					}
				}}
				align="start"
				alignOffset={-100}
				side="right"
			/>
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
