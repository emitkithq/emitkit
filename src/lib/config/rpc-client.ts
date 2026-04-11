import { browser } from '$app/environment';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createORPCSvelteQueryUtils } from '@orpc/svelte-query';
import type { RouterClient, InferRouterOutputs } from '@orpc/server';
import type { AppRouter } from '$lib/server/rpc/router';

const link = new RPCLink({
	url: browser ? `${window.location.origin}/api/rpc` : 'http://localhost:5173/api/rpc',
	fetch: (input, init) => fetch(input, { ...init, credentials: 'include' })
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
export const api = createORPCSvelteQueryUtils(orpc);
export type RouterOutputs = InferRouterOutputs<AppRouter>;
