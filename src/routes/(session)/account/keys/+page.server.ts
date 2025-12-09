import type { PageServerLoad } from './$types';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.activeOrganization) {
		throw redirect(302, '/');
	}

	if (!locals.user) {
		throw redirect(302, '/');
	}

	const projectsResult = await listProjectsByOrg(locals.activeOrganization.id, {
		page: 1,
		limit: 100
	});

	return {
		projects: projectsResult.items,
		organizationId: locals.activeOrganization.id,
		userId: locals.user.id
	};
};
