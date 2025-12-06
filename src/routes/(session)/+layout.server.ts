export const load = async ({ locals }) => {
	return {
		orgId: locals.activeOrganization!.id
	};
};
