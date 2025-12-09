import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getProjectByIdAndOrg } from '$lib/features/projects/server/repository';

export const load: LayoutServerLoad = async ({ params, parent }) => {
	const { orgId } = await parent();

	const project = await getProjectByIdAndOrg(params.project_id, orgId);

	if (!project) {
		error(404, 'Project not found');
	}

	return {
		project
	};
};
