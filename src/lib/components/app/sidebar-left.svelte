<script lang="ts">
	import { browser } from '$app/environment';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import { OrganizationSwitcher, UserButton } from 'better-auth-ui-svelte';
	import type { ComponentProps } from 'svelte';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import WorkflowIcon from '@lucide/svelte/icons/workflow';
	import KeysIcon from '@lucide/svelte/icons/key';
	import NavProjects from './nav-projects.svelte';
	import NavMain from './nav-main.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import { OnboardingWidget } from '$lib/components/onboarding';

	import Logo from '../logo.svelte';
	import { Badge } from '../ui/badge';

	let {
		ref = $bindable(null),

		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	// Get layout data for onboarding
	const layoutData = $derived(page.data);

	// Check if widget should show in sidebar (not collapsed, not dismissed, and onboarding incomplete)
	let showInSidebar = $state(true);

	// Check if onboarding is complete (has events + has API key or has multiple projects)
	const isOnboardingComplete = $derived(
		layoutData.hasEvents &&
			(layoutData.defaultSite?.slug !== 'default' ||
				(layoutData.projects && layoutData.projects.length > 1))
	);

	$effect(() => {
		if (browser && layoutData.orgId) {
			const key = `onboarding-widget-${layoutData.orgId}`;
			const stored = localStorage.getItem(key);
			if (stored) {
				try {
					const state = JSON.parse(stored);
					showInSidebar = !state.collapsed && !state.dismissed && !isOnboardingComplete;
				} catch {
					// Ignore parse errors
				}
			} else {
				// No stored state - hide if onboarding is complete
				showInSidebar = !isOnboardingComplete;
			}
		}
	});

	const navMain = $derived([
		{
			title: 'Feed',
			url: '/',
			icon: MessageSquareText,
			isActive: page.url.pathname === '/'
		},
		{
			title: 'Workflows',
			url: '/organization/workflows',
			icon: WorkflowIcon,
			isActive: page.url.pathname.startsWith('/organization/workflows')
		},
		{
			title: 'API Keys',
			url: '/account/keys',
			icon: KeysIcon,
			isActive: page.url.pathname.startsWith('/account/keys')
		}
	]);

	const data = $derived({
		navMain,
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
	});
</script>

<Sidebar.Root bind:ref class="border-r-0" {...restProps}>
	<Sidebar.Header
		class="h-12 shrink-0 !flex-row items-center !gap-0 border-b px-3 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
	>
		<Logo class="h-5" wrapperClass="flex w-full items-center justify-start gap-2">
			<Badge
				variant="default"
				class="rounded-sm px-1.5 py-0.5 text-[10px] dark:bg-muted/40 dark:text-muted-foreground"
				>Beta</Badge
			>
		</Logo>
	</Sidebar.Header>
	<Sidebar.Content>
		<OrganizationSwitcher
			hidePersonal={true}
			classNames={{
				trigger: {
					base: 'peer/menu-button text-foreground-sidebar outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground group-has-data-[sidebar=menu-action]/menu-item:pr-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm transition-[width,height,padding] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:font-medium [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 bg-sidebar data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
				}
			}}
		/>

		<NavMain items={data.navMain} />
		<NavProjects />

		<!-- Onboarding Widget in Sidebar -->
		{#if showInSidebar && layoutData.orgId && layoutData.defaultSite}
			<div class="mt-auto px-2 pb-2">
				<OnboardingWidget
					defaultSite={layoutData.defaultSite}
					hasEvents={layoutData.hasEvents}
					organizationId={layoutData.orgId}
					placement="sidebar"
				/>
			</div>
		{/if}

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
