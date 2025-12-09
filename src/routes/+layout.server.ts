import { siteConfig } from '$lib/server/site-config';

export const load = async () => {
	return {
		config: siteConfig
	};
};
