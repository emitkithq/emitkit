import { createId as createCuid2Id } from '@paralleldrive/cuid2';

export const prefixes = {
	test: 'test'
} as const;

export function createId<TPrefix extends keyof typeof prefixes>(
	prefix?: TPrefix,
	divider: '_' | '-' = '_'
) {
	if (!prefix) {
		return createCuid2Id();
	}

	return `${prefixes[prefix]}${divider}${createCuid2Id()}` as const;
}
