import type { PageServerLoad } from './$types';
import {
	getChannelByIdAndOrg,
	listChannelsByFolder
} from '$lib/features/channels/server/repository';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = locals.activeOrganization!.id;

	const [channel, channelsResult] = await Promise.all([
		getChannelByIdAndOrg(params.channel_id, orgId),
		listChannelsByFolder(params.project_id, { page: 1, limit: 100 })
	]);

	if (!channel) {
		error(404, 'Channel not found');
	}

	return {
		orgId,
		channels: channelsResult.items,
		channelId: params.channel_id,
		projectId: params.project_id
	};
};
