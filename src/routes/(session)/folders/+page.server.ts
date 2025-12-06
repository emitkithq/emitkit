import type { PageServerLoad } from './$types';
import { listFoldersByOrg } from '$lib/features/folders/server/repository';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.activeOrganization || !locals.user) {
		throw redirect(302, '/');
	}

	// Get all folders for the organization
	const foldersResult = await listFoldersByOrg(locals.activeOrganization.id, {
		page: 1,
		limit: 100
	});

	return {
		folders: foldersResult.items,
		organizationId: locals.activeOrganization.id,
		userId: locals.user.id
	};
};
