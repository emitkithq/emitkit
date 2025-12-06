import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const parentData = await parent();

	return {
		crumbs: [
			{
				title: parentData.folderName,
				url: `/events/${params.folder_id}/${params.channel_id}`,
				metadata: {
					iconUrl: parentData.folderIconUrl
				}
			}
		]
	};
};
