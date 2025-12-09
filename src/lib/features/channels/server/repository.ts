import { db, schema, type Channel, type ChannelInsert, type ChannelUpdate } from '$lib/server/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
	buildPaginatedQuery,
	type PaginatedQueryResult,
	type PaginationParams
} from '$lib/server/db/utils';
import { createLogger } from '$lib/server/logger';
import { slugify } from '$lib/server/utils/slug';

const logger = createLogger('channels');

export async function createChannel(channel: ChannelInsert): Promise<Channel> {
	const now = new Date();

	const [created] = await db
		.insert(schema.channel)
		.values({
			...channel,
			createdAt: channel.createdAt ?? now,
			updatedAt: channel.updatedAt ?? now
		})
		.returning();

	if (!created) {
		const error = new Error('Failed to create channel');
		logger.error('Channel creation failed', error, {
			organizationId: channel.organizationId,
			projectId: channel.projectId,
			name: channel.name
		});
		throw error;
	}

	logger.info('Channel created', {
		id: created.id,
		organizationId: created.organizationId,
		projectId: created.projectId,
		name: created.name
	});

	return created;
}

export async function getChannel(id: string): Promise<Channel | null> {
	const channel = await db.query.channel.findFirst({
		where: eq(schema.channel.id, id)
	});

	return channel ?? null;
}

export async function getChannelByIdAndOrg(id: string, orgId: string): Promise<Channel | null> {
	const channel = await db.query.channel.findFirst({
		where: and(eq(schema.channel.id, id), eq(schema.channel.organizationId, orgId))
	});

	return channel ?? null;
}

export async function getChannelByNameAndFolder(
	name: string,
	projectId: string
): Promise<Channel | null> {
	const channel = await db.query.channel.findFirst({
		where: and(eq(schema.channel.name, name), eq(schema.channel.projectId, projectId))
	});

	return channel ?? null;
}

export async function getOrCreateChannel(
	name: string,
	projectId: string,
	organizationId: string,
	options?: {
		icon?: string;
		description?: string;
	}
): Promise<Channel> {
	// Slugify the channel name to ensure consistency (lowercase, hyphen-separated)
	const slug = slugify(name);

	// Try to find existing channel by slugified name
	const existing = await getChannelByNameAndFolder(slug, projectId);
	if (existing) {
		logger.info('Channel found, reusing existing', {
			id: existing.id,
			name: slug,
			originalName: name,
			projectId,
			organizationId
		});
		return existing;
	}

	// Create new channel with slugified name
	logger.info('Channel not found, creating new', {
		name: slug,
		originalName: name,
		projectId,
		organizationId
	});
	return await createChannel({
		projectId,
		organizationId,
		name: slug,
		icon: options?.icon,
		description: options?.description
	});
}

export async function listChannels(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Channel>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	// Build the main query
	const query = db.query.channel.findMany({
		where: eq(schema.channel.organizationId, orgId),
		orderBy: (channels, { desc }) => [desc(channels.createdAt)],
		limit,
		offset
	});

	// Build the count query
	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.channel)
		.where(eq(schema.channel.organizationId, orgId));

	// Execute both queries and build paginated result
	const result = await buildPaginatedQuery(query, countQuery, { page, limit });

	return result;
}

export async function listChannelsByFolder(
	projectId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Channel>> {
	const page = pagination?.page || 1;
	const limit = pagination?.limit || 20;
	const offset = (page - 1) * limit;

	// Build the main query - exclude soft-deleted channels
	const query = db.query.channel.findMany({
		where: and(eq(schema.channel.projectId, projectId), isNull(schema.channel.deletedAt)),
		orderBy: (channels, { desc }) => [desc(channels.createdAt)],
		limit,
		offset
	});

	// Build the count query - exclude soft-deleted channels
	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.channel)
		.where(and(eq(schema.channel.projectId, projectId), isNull(schema.channel.deletedAt)));

	// Execute both queries and build paginated result
	const result = await buildPaginatedQuery(query, countQuery, { page, limit });

	return result;
}

export async function updateChannel(id: string, updates: ChannelUpdate): Promise<Channel> {
	const now = new Date();

	const [updated] = await db
		.update(schema.channel)
		.set({
			...updates,
			updatedAt: now
		})
		.where(eq(schema.channel.id, id))
		.returning();

	if (!updated) {
		const error = new Error('Failed to update channel');
		logger.error('Channel update failed', error, { id, updatedFields: Object.keys(updates) });
		throw error;
	}

	logger.info('Channel updated', {
		id: updated.id,
		updatedFields: Object.keys(updates),
		organizationId: updated.organizationId
	});

	return updated;
}

export async function deleteChannel(id: string): Promise<void> {
	await db.delete(schema.channel).where(eq(schema.channel.id, id));

	logger.info('Channel deleted', { id });
}
