import type { PageServerLoad } from './$types';
import { listProjectsByOrg } from '$lib/features/projects/server/repository';
import { listChannelsByFolder } from '$lib/features/channels/server/repository';
import { getUserPushSubscriptions } from '$lib/features/notifications/server';
import type { ProjectWithChannels } from '$lib/features/notifications/types';
import type { Project } from '$lib/features/projects/types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, activeOrganization } = locals;

	if (!user || !activeOrganization) {
		throw new Error('Unauthorized');
	}

	// Fetch all projects for this organization
	const projectsResult = await listProjectsByOrg(activeOrganization.id, { page: 1, limit: 100 });

	// Fetch channels for each project
	const projectsWithChannels: ProjectWithChannels[] = await Promise.all(
		projectsResult.items.map(async (project: Project) => {
			const channelsResult = await listChannelsByFolder(project.id, { page: 1, limit: 100 });
			return {
				...project,
				channels: channelsResult.items
			};
		})
	);

	// Get user's current push subscriptions
	const subscriptions = await getUserPushSubscriptions(user.id);
	const currentSubscription = subscriptions[0] || null; // Use first subscription for this device

	return {
		projects: projectsWithChannels,
		currentSubscription,
		organizationId: activeOrganization.id,
		userId: user.id
	};
};
