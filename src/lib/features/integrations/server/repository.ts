import { and, eq, or, desc } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { Integration, IntegrationInsert } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('integrations-repository');

export async function getIntegrationsForEvent(
	organizationId: string,
	folderId: string | null,
	channelId: string,
	event: {
		type?: string;
		tags?: string[];
	}
): Promise<Integration[]> {
	const conditions = [
		eq(schema.integration.organizationId, organizationId),
		eq(schema.integration.enabled, true)
	];

	const scopeConditions = [
		eq(schema.integration.scope, 'organization'),
		and(eq(schema.integration.scope, 'channel'), eq(schema.integration.channelId, channelId))
	];

	if (folderId) {
		scopeConditions.push(
			and(eq(schema.integration.scope, 'folder'), eq(schema.integration.folderId, folderId))
		);
	}

	const scopeCondition = or(...scopeConditions);
	if (scopeCondition) {
		conditions.push(scopeCondition);
	}

	const integrations = await db.query.integration.findMany({
		where: and(...conditions)
	});

	return integrations.filter((integration) => {
		const filters = integration.eventFilters;

		if (!filters || !filters.eventTypes || filters.eventTypes.includes('all')) {
			return true;
		}

		if (filters.eventTypes && event.type) {
			if (!filters.eventTypes.includes(event.type)) {
				return false;
			}
		}

		if (filters.tags && filters.tags.length > 0) {
			if (!event.tags || event.tags.length === 0) {
				return false;
			}
			const hasMatchingTag = filters.tags.some((tag) => event.tags?.includes(tag));
			if (!hasMatchingTag) {
				return false;
			}
		}

		return true;
	});
}

export async function listIntegrations(
	organizationId: string,
	options?: {
		scope?: 'organization' | 'folder' | 'channel';
		folderId?: string;
		channelId?: string;
	}
): Promise<Integration[]> {
	const conditions = [eq(schema.integration.organizationId, organizationId)];

	if (options?.scope) {
		conditions.push(eq(schema.integration.scope, options.scope));
	}

	if (options?.folderId) {
		conditions.push(eq(schema.integration.folderId, options.folderId));
	}

	if (options?.channelId) {
		conditions.push(eq(schema.integration.channelId, options.channelId));
	}

	return await db.query.integration.findMany({
		where: and(...conditions),
		orderBy: desc(schema.integration.createdAt)
	});
}

export async function listEnabledIntegrations(channelId: string): Promise<Integration[]> {
	const integrations = await db.query.integration.findMany({
		where: and(eq(schema.integration.channelId, channelId), eq(schema.integration.enabled, true)),
		orderBy: desc(schema.integration.createdAt)
	});

	return integrations;
}

export async function createIntegration(integration: IntegrationInsert): Promise<Integration> {
	const [created] = await db.insert(schema.integration).values(integration).returning();

	if (!created) {
		throw new Error('Failed to create integration');
	}

	logger.info('Integration created', {
		id: created.id,
		type: created.type,
		channelId: created.channelId
	});

	return created;
}

export async function getIntegration(id: string, orgId: string): Promise<Integration | null> {
	const integration = await db.query.integration.findFirst({
		where: and(eq(schema.integration.id, id), eq(schema.integration.organizationId, orgId))
	});

	return integration ?? null;
}

export async function getIntegrationById(id: string): Promise<Integration | null> {
	const integration = await db.query.integration.findFirst({
		where: eq(schema.integration.id, id)
	});

	return integration ?? null;
}

export async function updateIntegration(
	id: string,
	updates: Partial<Omit<Integration, 'id' | 'channelId' | 'organizationId' | 'createdAt'>>
): Promise<Integration> {
	const [updated] = await db
		.update(schema.integration)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(schema.integration.id, id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update integration');
	}

	logger.info('Integration updated', {
		id: updated.id,
		updatedFields: Object.keys(updates)
	});

	return updated;
}

export async function deleteIntegration(id: string): Promise<boolean> {
	const result = await db
		.delete(schema.integration)
		.where(eq(schema.integration.id, id))
		.returning();

	if (result.length > 0) {
		logger.info('Integration deleted', { id });
		return true;
	}

	return false;
}
