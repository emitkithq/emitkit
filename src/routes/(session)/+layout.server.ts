import type { LayoutServerLoad } from './$types';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';

export const load: LayoutServerLoad = async ({ locals }) => {
	const orgId = locals.activeOrganization!.id;

	const projectsResult = await listProjectsByOrg(orgId, { page: 1, limit: 100 });

	const defaultSite =
		projectsResult.items.find((p) => p.slug === 'default') || projectsResult.items[0] || null;

	return {
		orgId,
		defaultSite,
		projects: projectsResult.items
	};
};
