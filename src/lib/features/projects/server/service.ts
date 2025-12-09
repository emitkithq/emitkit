import { auth } from '$lib/server/auth';
import * as folderRepo from './repository';
import type { Project } from '$lib/server/db/schema';
import type { ProjectCreateInput, ProjectUpdateInput } from '../validators';
import type { ProjectCreateResponse } from '../types';
import { db } from '$lib/server/db';
import { apikey, channel } from '$lib/server/db/schema';
import { sql, eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('projects-service');

export async function createProjectWithApiKey(
	input: ProjectCreateInput,
	userId: string
): Promise<ProjectCreateResponse> {
	// Check if slug is available
	const slugAvailable = await folderRepo.isSlugAvailable(input.organizationId, input.slug);
	if (!slugAvailable) {
		const error = new Error('A project with this slug already exists in your organization');
		logger.error('Project creation failed: slug already exists', error, {
			organizationId: input.organizationId,
			slug: input.slug,
			userId
		});
		throw error;
	}

	// Create the project
	const project = await folderRepo.createFolder({
		organizationId: input.organizationId,
		name: input.name,
		slug: input.slug,
		url: input.url,
		description: input.description
	});

	// Create API key with Better Auth
	const apiKey = await auth.api.createApiKey({
		body: {
			name: `${project.name} API Key`,
			userId,
			metadata: {
				projectId: project.id,
				orgId: input.organizationId, // Note: using orgId to match middleware expectations
				projectName: project.name
			},
			// No expiration by default
			expiresIn: undefined,
			// Use default rate limits from plugin config
			rateLimitEnabled: true
		}
	});

	if (!apiKey) {
		// Rollback: hard delete the project if API key creation failed
		await folderRepo.hardDeleteProject(project.id, input.organizationId);
		const error = new Error('Failed to create API key for project');
		logger.error('API key creation failed for project, rolled back project creation', error, {
			projectId: project.id,
			organizationId: input.organizationId,
			userId
		});
		throw error;
	}

	logger.info('Project created with API key', {
		projectId: project.id,
		organizationId: project.organizationId,
		name: project.name,
		slug: project.slug,
		apiKeyId: apiKey.id,
		userId
	});

	return {
		project,
		apiKey: {
			id: apiKey.id,
			key: apiKey.key, // Full key only returned here!
			start: apiKey.start,
			name: apiKey.name
		}
	};
}

export async function getProject(projectId: string, orgId: string): Promise<Project | null> {
	return await folderRepo.getProjectByIdAndOrg(projectId, orgId);
}

export async function updateProject(
	projectId: string,
	orgId: string,
	input: ProjectUpdateInput
): Promise<Project> {
	// Verify ownership
	const existing = await folderRepo.getProjectByIdAndOrg(projectId, orgId);
	if (!existing) {
		throw new Error('Project not found or access denied');
	}

	// If slug is being changed, verify it's available
	if (input.slug && input.slug !== existing.slug) {
		const slugAvailable = await folderRepo.isSlugAvailable(orgId, input.slug);
		if (!slugAvailable) {
			throw new Error('A project with this slug already exists in your organization');
		}
	}

	return await folderRepo.updateProject(projectId, input);
}

export async function deleteProject(projectId: string, orgId: string): Promise<void> {
	const operation = logger.start('Soft delete project', { projectId, organizationId: orgId });

	try {
		// Verify ownership (include deleted projects to prevent access if already deleted)
		const existing = await folderRepo.getProjectByIdAndOrg(projectId, orgId, false);
		if (!existing) {
			const error = new Error('Project not found or access denied');
			logger.error('Project deletion failed: not found or access denied', error, {
				projectId,
				orgId
			});
			throw error;
		}

		operation.step('Soft deleting associated channels');
		// Soft delete all channels associated with the project
		await db
			.update(channel)
			.set({
				deletedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(channel.projectId, projectId));

		operation.step('Disabling API keys');
		// Disable all API keys associated with the project
		const disabledKeys = await db
			.update(apikey)
			.set({
				enabled: false,
				updatedAt: new Date()
			})
			.where(sql`${apikey.metadata}->>'projectId' = ${projectId}`)
			.returning();

		operation.step('Soft deleting project');
		// Soft delete the project by setting deletedAt timestamp
		await folderRepo.softDeleteProject(projectId);

		operation.end({
			projectId,
			organizationId: orgId,
			projectName: existing.name,
			disabledApiKeys: disabledKeys.length
		});

		// IMPORTANT: Soft delete behavior
		// - Project is marked as deleted (deletedAt timestamp set)
		// - Channels are soft deleted (can be restored)
		// - API keys are disabled (prevents unauthorized access)
		// - Events and identity data in Tinybird are NOT affected
		// - Data can be fully restored within retention period
		// - After retention period, a cleanup job should hard delete old soft-deleted projects

		logger.success('Project soft deleted successfully', {
			projectId,
			organizationId: orgId,
			projectName: existing.name,
			disabledApiKeys: disabledKeys.length,
			note: 'Project can be restored within retention period'
		});
	} catch (error) {
		operation.error('Failed to soft delete project', error instanceof Error ? error : undefined, {
			projectId,
			organizationId: orgId
		});
		throw error;
	}
}

export async function restoreProject(projectId: string, orgId: string): Promise<void> {
	const operation = logger.start('Restore project', { projectId, organizationId: orgId });

	try {
		// Verify ownership (include deleted projects since we're restoring)
		const existing = await folderRepo.getProjectByIdAndOrg(projectId, orgId, true);
		if (!existing) {
			const error = new Error('Project not found or access denied');
			logger.error('Project restore failed: not found or access denied', error, {
				projectId,
				orgId
			});
			throw error;
		}

		// Check if project is actually deleted
		if (!existing.deletedAt) {
			const error = new Error('Project is not deleted');
			logger.error('Project restore failed: project is not deleted', error, { projectId, orgId });
			throw error;
		}

		operation.step('Restoring project');
		// Restore the project by clearing deletedAt timestamp
		await folderRepo.restoreProject(projectId);

		operation.step('Restoring associated channels');
		// Restore all channels associated with the project
		await db
			.update(channel)
			.set({
				deletedAt: null,
				updatedAt: new Date()
			})
			.where(eq(channel.projectId, projectId));

		operation.step('Re-enabling API keys');
		// Re-enable all API keys associated with the project
		const enabledKeys = await db
			.update(apikey)
			.set({
				enabled: true,
				updatedAt: new Date()
			})
			.where(sql`${apikey.metadata}->>'projectId' = ${projectId}`)
			.returning();

		operation.end({
			projectId,
			organizationId: orgId,
			projectName: existing.name,
			enabledApiKeys: enabledKeys.length
		});

		logger.success('Project restored successfully', {
			projectId,
			organizationId: orgId,
			projectName: existing.name,
			enabledApiKeys: enabledKeys.length
		});
	} catch (error) {
		operation.error('Failed to restore project', error instanceof Error ? error : undefined, {
			projectId,
			organizationId: orgId
		});
		throw error;
	}
}
