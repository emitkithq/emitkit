import type { LayoutServerLoad } from './$types';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';
import { listEventsByOrg } from '$lib/features/events/server';

export const load: LayoutServerLoad = async ({ locals }) => {
	// activeOrganization is guaranteed to exist by hooks.server.ts guard
	const orgId = locals.activeOrganization!.id;

	// Load minimal data for onboarding widget
	const [projectsResult, eventsResult] = await Promise.all([
		listProjectsByOrg(orgId, { page: 1, limit: 100 }),
		listEventsByOrg(orgId, { page: 1, limit: 1 }) // Just check existence
	]);

	const defaultSite =
		projectsResult.items.find((p) => p.slug === 'default') || projectsResult.items[0] || null;

	return {
		orgId,
		defaultSite,
		hasEvents: eventsResult.items.length > 0,
		projects: projectsResult.items // For onboarding completion check
	};
};
