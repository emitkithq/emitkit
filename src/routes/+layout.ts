import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export const ssr = false;

export async function load({ data }: Parameters<import('./$types').LayoutLoad>[0]) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				staleTime: 1000 * 60 * 5,
				gcTime: 1000 * 60 * 10
			}
		}
	});
	return { ...data, queryClient };
}
