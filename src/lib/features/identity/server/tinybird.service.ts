import { tinybird } from '$lib/server/tinybird';
import { randomUUID } from 'crypto';

export interface TinybirdUserIdentity {
	id: string;
	organization_id: string;
	user_id: string;
	email: string;
	name: string;
	properties: string; // JSON string
	aliases: string[]; // Array of strings
	created_at: string; // ISO 8601
	updated_at: string; // ISO 8601
}

export interface UserIdentityData {
	organizationId: string;
	userId: string;
	properties?: Record<string, unknown>;
	aliases?: string[];
}

export interface UserIdentityResponse {
	id: string;
	userId: string;
	email: string;
	name: string;
	properties: Record<string, unknown>;
	aliases: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ResolvedUser {
	user_id: string;
	email: string;
	name: string;
}

/**
 * Upsert a user identity in Tinybird
 * Uses ReplacingMergeTree to handle updates based on updated_at version
 */
export async function upsertUserIdentity(data: UserIdentityData): Promise<UserIdentityResponse> {
	const now = new Date().toISOString();
	const properties = data.properties || {};
	const aliases = data.aliases || [];

	// Extract common fields from properties
	const email = (properties.email as string) || '';
	const name = (properties.name as string) || '';

	const identity: TinybirdUserIdentity = {
		id: randomUUID(),
		organization_id: data.organizationId,
		user_id: data.userId,
		email,
		name,
		properties: JSON.stringify(properties),
		aliases,
		created_at: now,
		updated_at: now
	};

	await tinybird.ingestToDatasource('user_identities', identity, false); // Non-blocking

	return {
		id: identity.id,
		userId: identity.user_id,
		email: identity.email,
		name: identity.name,
		properties,
		aliases: identity.aliases,
		createdAt: identity.created_at,
		updatedAt: identity.updated_at
	};
}

/**
 * Get user identity by user_id
 * Returns the latest version from ReplacingMergeTree
 */
export async function getUserIdentity(
	organizationId: string,
	userId: string
): Promise<UserIdentityResponse | null> {
	interface TinybirdResponse {
		data: TinybirdUserIdentity[];
	}

	const result = await tinybird.queryPipe<TinybirdResponse>('get_user_identity', {
		organization_id: organizationId,
		user_id: userId
	});

	if (!result.data || result.data.length === 0) {
		return null;
	}

	const identity = result.data[0];
	const properties = identity.properties ? JSON.parse(identity.properties) : {};

	return {
		id: identity.id,
		userId: identity.user_id,
		email: identity.email,
		name: identity.name,
		properties,
		aliases: identity.aliases || [],
		createdAt: identity.created_at,
		updatedAt: identity.updated_at
	};
}

/**
 * Resolve an alias to a canonical user_id
 * Searches both user_id and aliases array
 */
export async function resolveUserAlias(
	organizationId: string,
	alias: string
): Promise<string | null> {
	interface TinybirdResponse {
		data: ResolvedUser[];
	}

	const result = await tinybird.queryPipe<TinybirdResponse>('resolve_user_alias', {
		organization_id: organizationId,
		alias
	});

	if (!result.data || result.data.length === 0) {
		return null;
	}

	return result.data[0].user_id;
}
