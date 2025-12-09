import { createId as createCuid2Id } from '@paralleldrive/cuid2';
import type { LiteralUnion } from '@better-auth/core';

type BetterAuthModels =
	| 'apikey'
	| 'user'
	| 'account'
	| 'session'
	| 'verification'
	| 'organization'
	| 'member'
	| 'invitation'
	| 'two-factor';

export const betterAuthPrefixes: Record<BetterAuthModels, string> = {
	user: 'user',
	apikey: 'api',
	account: 'acc',
	session: 'sess',
	verification: 'ver',
	organization: 'org',
	member: 'mbr',
	invitation: 'inv',
	'two-factor': '2fa'
};

export function createBetterAuthId<TModel extends LiteralUnion<BetterAuthModels, string>>(
	model: TModel,
	divider: '_' | '-' = '_'
) {
	const prefix = (betterAuthPrefixes as Record<string, string>)[model] || model;
	return `${prefix}${divider}${createCuid2Id()}`;
}
