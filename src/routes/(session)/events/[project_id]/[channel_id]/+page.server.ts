import type { PageServerLoad } from './$types';
import { getChannelByIdAndOrg } from '$lib/features/channels/server/repository';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';
import { listChannels } from '$lib/features/channels/server/repository';
import { listEvents } from '$lib/features/events/server';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, parent, request }) => {
	// Get parent data (includes orgId from session layout)
	const { orgId } = await parent();

	// Verify channel exists and belongs to this organization
	const channel = await getChannelByIdAndOrg(params.channel_id, orgId);

	if (!channel) {
		error(404, 'Channel not found');
	}

	// Load initial events for this channel
	const [eventsResult, projectsResult, channelsResult] = await Promise.all([
		listEvents(params.channel_id, orgId, {
			page: 1,
			limit: 20
		}),
		// Load all projects for mapping (needed for event display)
		listProjectsByOrg(orgId, {
			page: 1,
			limit: 100
		}),
		// Load all channels for mapping
		listChannels(orgId, {
			page: 1,
			limit: 100
		})
	]);

	return {
		orgId,
		events: eventsResult,
		projects: projectsResult.items,
		channels: channelsResult.items,
		channelId: params.channel_id,
		projectId: params.project_id
	};
};
