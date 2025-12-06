import type { PageServerLoad } from './$types';
import { listFoldersByOrg } from '$lib/features/folders/server/repository';
import { listChannelsByFolder } from '$lib/features/channels/server/repository';
import { getUserPushSubscriptions } from '$lib/features/notifications/server';
import type { FolderWithChannels } from '$lib/features/notifications/types';
import type { Folder } from '$lib/features/folders/types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, activeOrganization } = locals;

	if (!user || !activeOrganization) {
		throw new Error('Unauthorized');
	}

	// Fetch all folders for this organization
	const foldersResult = await listFoldersByOrg(activeOrganization.id, { page: 1, limit: 100 });

	// Fetch channels for each folder
	const foldersWithChannels: FolderWithChannels[] = await Promise.all(
		foldersResult.items.map(async (folder: Folder) => {
			const channelsResult = await listChannelsByFolder(folder.id, { page: 1, limit: 100 });
			return {
				...folder,
				channels: channelsResult.items
			};
		})
	);

	// Get user's current push subscriptions
	const subscriptions = await getUserPushSubscriptions(user.id);
	const currentSubscription = subscriptions[0] || null; // Use first subscription for this device

	return {
		folders: foldersWithChannels,
		currentSubscription,
		organizationId: activeOrganization.id,
		userId: user.id
	};
};
