import type { ApiKey } from '$lib/server/db/schema';
import type { Project } from '$lib/server/db/schema';

export type ApiKeyWithProject = ApiKey & {
	project: {
		id: string;
		name: string;
		slug: string;
		organizationId: string;
	} | null;
};

export type ApiKeyCreateInput = {
	name: string;
	projectId: string;
	organizationId: string;
};

export type ApiKeyDeleteInput = {
	keyId: string;
};

export type ApiKeyCreateResponse = {
	key: string;
	id: string;
	name: string | null;
	start: string | null;
	createdAt: Date;
};
