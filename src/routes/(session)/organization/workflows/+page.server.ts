import type { PageServerLoad } from './$types';
import { listWorkflows } from '$lib/features/workflows/server/repository';

export const load: PageServerLoad = async ({ locals, request, url }) => {
	const session = await locals.getSession({
		headers: request.headers
	});

	if (!session?.session?.activeOrganizationId) {
		return {
			workflows: {
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
	const page = Number(url.searchParams.get('page')) || 1;
	const limit = Number(url.searchParams.get('limit')) || 20;

	const workflows = await listWorkflows(orgId, { page, limit });

	return {
		workflows,
		orgId
	};
};
