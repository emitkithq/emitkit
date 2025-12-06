import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getFolderByIdAndOrg } from '$lib/features/folders/server/repository';

export const load: LayoutServerLoad = async ({ params, parent }) => {
	const { orgId } = await parent();

	// Fetch the folder
	const folder = await getFolderByIdAndOrg(params.folder_id, orgId);

	if (!folder) {
		error(404, 'Folder not found');
	}

	return {
		folder
	};
};
