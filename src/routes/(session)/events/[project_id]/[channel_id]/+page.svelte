<script lang="ts">
	import type { PageProps } from './$types';
	import { Wrapper } from '$lib/components/ui/wrapper';
	import { onMount } from 'svelte';
	import { getPageActionsContext } from '$lib/context/page-actions.svelte';
	import ChannelTitle from '$lib/features/events/components/channel-title.svelte';
	import EventFeed from '$lib/features/events/components/event-feed.svelte';

	let { params, data }: PageProps = $props();

	const ownerId = $derived(Symbol(`events-page-${params.project_id}-${params.channel_id}`));
	const pageActions = getPageActionsContext();

	onMount(() => {
		pageActions.registerLeft(ownerId, [
			{
				component: ChannelTitle,
				props: {
					name: 'Channel'
				}
			}
		]);

		return () => {
			pageActions.unregister(ownerId);
		};
	});
</script>

<Wrapper alignment="center">
	<EventFeed
		organizationId={data.orgId}
		initialEvents={data.events}
		sites={data.projects}
		channels={data.channels}
		channelId={data.channelId}
		projectId={data.projectId}
		showChannelContext={false}
	/>
</Wrapper>
