import type { PageServerLoad } from './$types';
import { listChannels } from '$lib/features/channels/server/repository';

export const load: PageServerLoad = async ({ locals, request, url }) => {
	const session = await locals.getSession({
		headers: request.headers
	});

	if (!session?.session?.activeOrganizationId) {
		return {
			channels: [],
			selectedProjectId: null
		};
	}

	const orgId = session.session.activeOrganizationId;
	const selectedProjectId = url.searchParams.get('project_id');

	const channelsResult = await listChannels(orgId, { page: 1, limit: 100 });

	return {
		channels: channelsResult.items,
		orgId,
		selectedProjectId
	};
};
