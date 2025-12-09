import type { LayoutLoad } from './$types';
import { getFaviconUrl } from '$lib/utils/url';

export const load: LayoutLoad = async ({ data, parent }) => {
	const parentData = await parent();

	const { project } = data;

	return {
		...parentData,
		projectId: project.id,
		projectName: project.name || project.id,
		projectIconUrl: getFaviconUrl(project.url)
	};
};
