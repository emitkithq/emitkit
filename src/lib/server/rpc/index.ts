import { os, ORPCError } from '@orpc/server';

export type ORPCContext = {
	locals: App.Locals;
	request: Request;
};

const _base = os.$context<ORPCContext>().errors({
	UNAUTHORIZED: { message: 'Unauthorized' },
	FORBIDDEN: { message: 'Forbidden' },
	NOT_FOUND: { message: 'Not found' }
});

const authMiddleware = _base.middleware(async ({ context, next }) => {
	const { user, activeOrganization, activeOrganizationMember } = context.locals;
	if (!user || !activeOrganization) {
		throw new ORPCError('UNAUTHORIZED');
	}
	return next({
		context: { user, activeOrganization, activeOrganizationMember, request: context.request }
	});
});

export const base = _base;
export const middleware = { auth: authMiddleware };
