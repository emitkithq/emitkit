import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { router } from '$lib/server/rpc/router';
import type { ORPCContext } from '$lib/server/rpc';
import type { RequestHandler } from './$types';

const handler = new RPCHandler<ORPCContext>(router, {
	interceptors: [
		onError((error) => {
			console.error('[oRPC error]', error);
		})
	]
});

const handle: RequestHandler = async ({ request, locals }) => {
	const { response } = await handler.handle(request, {
		prefix: '/api/rpc',
		context: { locals, request }
	});
	return response ?? new Response('Not Found', { status: 404 });
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
