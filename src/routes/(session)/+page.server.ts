import type { PageServerLoad } from './$types';
import { listFoldersByOrg } from '$lib/features/folders/server/repository';
import { listEventsByOrg } from '$lib/features/events/server';
import { listChannels } from '$lib/features/channels/server/repository';

export const load: PageServerLoad = async ({ locals, request }) => {
	const session = await locals.getSession({
		headers: request.headers
	});

	if (!session?.session?.activeOrganizationId) {
		return {
			folders: [],
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
			}
		};
	}

	const orgId = session.session.activeOrganizationId;

	// Get folders, channels, and events for the organization in parallel
	const [foldersResult, channelsResult, eventsResult] = await Promise.all([
		listFoldersByOrg(orgId, {
			page: 1,
			limit: 100 // Get all folders
		}),
		listChannels(orgId, {
			page: 1,
			limit: 100 // Get all channels for mapping
		}),
		listEventsByOrg(orgId, {
			page: 1,
			limit: 20
		})
	]);

	return {
		folders: foldersResult.items,
		channels: channelsResult.items,
		events: eventsResult,
		orgId
	};
};
