import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createBetterAuthId } from '$lib/server/db/schema/utils';
import type { Project, ProjectInsert, ProjectUpdate } from '$lib/server/db/schema';
import type { PaginationParams, PaginatedQueryResult } from '$lib/server/db/utils';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('projects');

export async function createFolder(data: Omit<ProjectInsert, 'id'>): Promise<Project> {
	const [newFolder] = await db
		.insert(project)
		.values({
			id: createBetterAuthId('project'),
			...data,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning();

	if (!newFolder) {
		const error = new Error('Failed to create folder');
		logger.error('Folder creation failed', error, {
			organizationId: data.organizationId,
			name: data.name,
			slug: data.slug
		});
		throw error;
	}

	logger.info('Folder created', {
		id: newFolder.id,
		organizationId: newFolder.organizationId,
		name: newFolder.name,
		slug: newFolder.slug
	});

	return newFolder;
}

export async function getProjectById(
	projectId: string,
	includeDeleted = false
): Promise<Project | null> {
	const conditions = [eq(project.id, projectId)];
	if (!includeDeleted) {
		conditions.push(isNull(project.deletedAt));
	}

	const [result] = await db
		.select()
		.from(project)
		.where(and(...conditions))
		.limit(1);

	return result ?? null;
}

export async function getProjectByIdAndOrg(
	projectId: string,
	orgId: string,
	includeDeleted = false
): Promise<Project | null> {
	const conditions = [eq(project.id, projectId), eq(project.organizationId, orgId)];
	if (!includeDeleted) {
		conditions.push(isNull(project.deletedAt));
	}

	const [result] = await db
		.select()
		.from(project)
		.where(and(...conditions))
		.limit(1);

	return result ?? null;
}

export async function getProjectByOrgAndSlug(
	orgId: string,
	slug: string,
	includeDeleted = false
): Promise<Project | null> {
	const conditions = [eq(project.organizationId, orgId), eq(project.slug, slug)];
	if (!includeDeleted) {
		conditions.push(isNull(project.deletedAt));
	}

	const [result] = await db
		.select()
		.from(project)
		.where(and(...conditions))
		.limit(1);

	return result ?? null;
}

export async function listProjectsByOrg(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Project>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	// Get folders (API keys are managed separately) - exclude soft-deleted
	const projects = await db
		.select()
		.from(project)
		.where(and(eq(project.organizationId, orgId), isNull(project.deletedAt)))
		.orderBy(project.createdAt)
		.limit(limit)
		.offset(offset);

	// Get total count - exclude soft-deleted
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(project)
		.where(and(eq(project.organizationId, orgId), isNull(project.deletedAt)));

	// Build pagination metadata
	const total = Number(count);
	const totalPages = Math.ceil(total / limit);

	return {
		items: projects,
		metadata: {
			total,
			page,
			limit,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}

export async function updateProject(projectId: string, data: ProjectUpdate): Promise<Project> {
	const [updated] = await db
		.update(project)
		.set({
			...data,
			updatedAt: new Date()
		})
		.where(eq(project.id, projectId))
		.returning();

	if (!updated) {
		const error = new Error('Failed to update folder or folder not found');
		logger.error('Folder update failed', error, { projectId, updatedFields: Object.keys(data) });
		throw error;
	}

	logger.info('Folder updated', {
		id: updated.id,
		updatedFields: Object.keys(data),
		organizationId: updated.organizationId
	});

	return updated;
}

export async function softDeleteProject(projectId: string): Promise<Project> {
	const [deleted] = await db
		.update(project)
		.set({
			deletedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(project.id, projectId))
		.returning();

	if (!deleted) {
		const error = new Error('Failed to soft delete folder or folder not found');
		logger.error('Folder soft delete failed', error, { projectId });
		throw error;
	}

	logger.info('Folder soft deleted', { projectId, deletedAt: deleted.deletedAt });

	return deleted;
}

export async function restoreProject(projectId: string): Promise<Project> {
	const [restored] = await db
		.update(project)
		.set({
			deletedAt: null,
			updatedAt: new Date()
		})
		.where(eq(project.id, projectId))
		.returning();

	if (!restored) {
		const error = new Error('Failed to restore folder or folder not found');
		logger.error('Folder restore failed', error, { projectId });
		throw error;
	}

	logger.info('Folder restored', { projectId });

	return restored;
}

export async function hardDeleteProject(projectId: string, orgId: string): Promise<void> {
	const result = await db
		.delete(project)
		.where(and(eq(project.id, projectId), eq(project.organizationId, orgId)))
		.returning();

	if (result.length === 0) {
		const error = new Error('Folder not found or access denied');
		logger.error('Hard delete failed: folder not found or access denied', error, {
			projectId,
			orgId
		});
		throw error;
	}

	logger.warn('Folder hard deleted (permanent)', { projectId, organizationId: orgId });
}

export async function listDeletedProjectsByOrg(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Project>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	// Get only soft-deleted folders
	const projects = await db
		.select()
		.from(project)
		.where(and(eq(project.organizationId, orgId), sql`${project.deletedAt} IS NOT NULL`))
		.orderBy(project.deletedAt)
		.limit(limit)
		.offset(offset);

	// Get total count of soft-deleted folders
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(project)
		.where(and(eq(project.organizationId, orgId), sql`${project.deletedAt} IS NOT NULL`));

	// Build pagination metadata
	const total = Number(count);
	const totalPages = Math.ceil(total / limit);

	return {
		items: projects,
		metadata: {
			total,
			page,
			limit,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}

export async function isSlugAvailable(orgId: string, slug: string): Promise<boolean> {
	// Check if slug is available (excluding soft-deleted projects)
	const existing = await getProjectByOrgAndSlug(orgId, slug, false);
	const available = !existing;

	return available;
}
