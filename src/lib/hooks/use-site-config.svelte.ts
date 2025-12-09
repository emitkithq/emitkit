import { getContext, setContext } from 'svelte';
import type { SiteConfig } from '$lib/server/site-config';

const SITE_CONFIG_KEY = Symbol('siteConfig');

export function setSiteConfig(config: SiteConfig) {
	setContext(SITE_CONFIG_KEY, config);
}

export function useSiteConfig(): SiteConfig {
	const config = getContext<SiteConfig>(SITE_CONFIG_KEY);

	if (!config) {
		throw new Error(
			'useSiteConfig must be called within a component that has setSiteConfig in a parent'
		);
	}

	return config;
}
