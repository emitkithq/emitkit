import type { PageServerLoad } from './$types';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';
import { listEventsByOrg } from '$lib/features/events/server';
import { listChannels } from '$lib/features/channels/server/repository';

export const load: PageServerLoad = async ({ locals, request, url }) => {
	const session = await locals.getSession({
		headers: request.headers
	});

	if (!session?.session?.activeOrganizationId) {
		return {
			projects: [],
			channels: [],
			events: {
				items: [],
				metadata: {
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 0,
					hasNextPage: false,
					hasPreviousPage: false
				}
			},
			selectedProjectId: null
		};
	}

	const orgId = session.session.activeOrganizationId;

	// Get optional project filter from URL
	const selectedProjectId = url.searchParams.get('project_id');

	const [foldersResult, channelsResult, eventsResult] = await Promise.all([
		listProjectsByOrg(orgId, {
			page: 1,
			limit: 100 // Get all folders
		}),
		listChannels(orgId, {
			page: 1,
			limit: 100 // Get all channels for mapping
		}),
		// Pass project filter to events query if provided
		listEventsByOrg(
			orgId,
			{
				page: 1,
				limit: 20
			},
			selectedProjectId || undefined
		)
	]);

	return {
		projects: foldersResult.items,
		channels: channelsResult.items,
		events: eventsResult,
		orgId,
		selectedProjectId
	};
};
