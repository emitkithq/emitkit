import type { PageServerLoad } from './$types';
import { getWorkflow } from '$lib/features/workflows/server/repository';
import { listChannels } from '$lib/features/channels/server/repository';
import { listFoldersByOrg } from '$lib/features/folders/server/repository';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, request, params }) => {
	const session = await locals.getSession({
		headers: request.headers
	});

	const organizationId = session?.session?.activeOrganizationId;

	if (!organizationId) {
		error(401, 'Unauthorized');
	}

	const workflow = await getWorkflow(params.workflowId, organizationId);

	if (!workflow) {
		error(404, 'Workflow not found');
	}

	// Fetch channels and folders for trigger configuration
	const [channelsResult, foldersResult] = await Promise.all([
		listChannels(organizationId),
		listFoldersByOrg(organizationId)
	]);

	return {
		workflow,
		organizationId,
		channels: channelsResult.items.map((c) => ({
			id: c.id,
			name: c.name
		})),
		folders: foldersResult.items.map((f) => ({
			id: f.id,
			name: f.name
		}))
	};
};
