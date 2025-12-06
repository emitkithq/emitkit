import type { LayoutLoad } from './$types';
import { getFaviconUrl } from '$lib/utils/url';

export const load: LayoutLoad = async ({ data, parent }) => {
	const parentData = await parent();

	// Use store data loaded from +layout.server.ts
	const { folder } = data;

	return {
		...parentData,
		folderId: folder.id,
		folderName: folder.name || folder.id,
		folderIconUrl: getFaviconUrl(folder.url)
	};
};
