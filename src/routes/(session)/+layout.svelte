<script lang="ts">
	import { browser } from '$app/environment';
	import SidebarLeft from '$lib/components/app/sidebar-left.svelte';
	// import SidebarRight from '$lib/components/app/sidebar-right.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { createBreadcrumbActionsContext } from '$lib/context/breadcrumb-actions.svelte';
	import { createPageActionsContext } from '$lib/context/page-actions.svelte';
	import { cn } from '$lib/utils/ui.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { BreadcrumbsProvider } from '$lib/components/breadcrumbs-provider/index.js';
	import { DEFAULT_CLASSES } from '$lib/client/constants.js';
	import { page } from '$app/state';
	import { OnboardingWidget } from '$lib/components/onboarding';

	let { children, data } = $props();

	// Track if widget is collapsed (in localStorage)
	let widgetCollapsed = $state(false);
	let widgetDismissed = $state(false);

	// Load state from localStorage
	$effect(() => {
		if (browser && data.orgId) {
			const key = `onboarding-widget-${data.orgId}`;
			const stored = localStorage.getItem(key);
			if (stored) {
				try {
					const state = JSON.parse(stored);
					widgetCollapsed = state.collapsed || false;
					widgetDismissed = state.dismissed || false;
				} catch {
					// Ignore parse errors
				}
			}
		}
	});

	function handleWidgetExpand() {
		widgetCollapsed = false;
		// Widget will now show in sidebar
	}

	let pageDataCrumbs = $derived(page.data.crumbs);

	const breadcrumbActions = createBreadcrumbActionsContext();
	const pageActions = createPageActionsContext();

	// Clear page actions when route changes to prevent stale actions from previous routes
	$effect(() => {
		// Watch the route ID to detect navigation
		void page.route.id;
		// This effect will run after route changes, giving child components a chance to register new actions
	});
</script>

<Sidebar.Provider>
	<SidebarLeft />

	<Sidebar.Inset>
		<header
			class="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class={cn('flex flex-1 items-center gap-2', DEFAULT_CLASSES.APP_CONTENT_PADDING_X)}>
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />

				<BreadcrumbsProvider
					url={page.url}
					routeId={page.route.id}
					pageData={page.data}
					crumbs={pageDataCrumbs}
				>
					{#snippet children({ crumbs })}
						<Breadcrumb.Root>
							<Breadcrumb.List>
								<!-- Home -->
								<Breadcrumb.Item class="hidden: md:block">
									<Breadcrumb.Link href="/">Overview</Breadcrumb.Link>
								</Breadcrumb.Item>

								<!-- Crumbs -->
								{#each crumbs as c (c.url)}
									<Breadcrumb.Separator class="hidden md:block" />

									<Breadcrumb.Item class="hidden md:block">
										<Breadcrumb.Link
											href={c.url}
											class={cn(c.url === page.url && 'text-foreground', 'flex items-center gap-2')}
										>
											{#if c.metadata?.iconUrl}
												<Avatar.Root class="h-4 w-4">
													<Avatar.Image src={c.metadata.iconUrl} alt={c.title} />
													<Avatar.Fallback class="text-[8px]">{c.title?.charAt(0)}</Avatar.Fallback>
												</Avatar.Root>
											{/if}
											{c.title}
										</Breadcrumb.Link>
									</Breadcrumb.Item>
								{/each}
							</Breadcrumb.List>
						</Breadcrumb.Root>
					{/snippet}
				</BreadcrumbsProvider>
			</div>

			{#if breadcrumbActions.action}
				<div class={cn(DEFAULT_CLASSES.APP_CONTENT_PADDING_X)}>
					<breadcrumbActions.action.component {...breadcrumbActions.action.props} />
				</div>
			{/if}
		</header>

		<!-- Page Actions Bar -->
		{#if pageActions.leftActions.length > 0 || pageActions.rightActions.length > 0}
			<div class="flex items-center justify-between gap-4 border-b bg-background px-3 py-2.5">
				<div class="flex items-center gap-2">
					{#each pageActions.leftActions as action (action.actionId)}
						{#if action?.component && action?.props}
							<action.component {...action.props} />
						{/if}
					{/each}
				</div>
				<div class="flex items-center gap-2">
					{#each pageActions.rightActions as action (action.actionId)}
						{#if action?.component && action?.props}
							<action.component {...action.props} />
						{/if}
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex flex-1 flex-col gap-4 p-4">
			{@render children()}
		</div>
	</Sidebar.Inset>

	<!-- <SidebarRight /> -->
</Sidebar.Provider>

<!-- Floating Button (when widget collapsed) -->
{#if data.orgId && widgetCollapsed && !widgetDismissed && data.defaultSite}
	<OnboardingWidget
		defaultSite={data.defaultSite}
		hasEvents={data.hasEvents}
		organizationId={data.orgId}
		placement="floating"
		onExpand={handleWidgetExpand}
	/>
{/if}
