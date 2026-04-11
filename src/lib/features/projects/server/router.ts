import { z } from 'zod';
import { base, middleware } from '$lib/server/rpc';
import { projectCreateSchema, projectUpdateSchema, projectListParamsSchema } from '../validators';
import * as folderRepo from '$lib/features/projects/server/repository';
import * as folderService from '$lib/features/projects/server/service';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('projects-router');

const authed = base.use(middleware.auth);

const list = authed.input(projectListParamsSchema).handler(async ({ input }) => {
	return await folderRepo.listProjectsByOrg(input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

const listDeleted = authed.input(projectListParamsSchema).handler(async ({ input }) => {
	return await folderRepo.listDeletedProjectsByOrg(input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

const get = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string(),
			userId: z.string()
		})
	)
	.handler(async ({ input }) => {
		return await folderService.getProject(input.projectId, input.organizationId);
	});

const create = authed
	.input(
		projectCreateSchema.extend({
			userId: z.string()
		})
	)
	.handler(async ({ input }) => {
		try {
			return await folderService.createProjectWithApiKey(
				{
					organizationId: input.organizationId,
					name: input.name,
					slug: input.slug,
					url: input.url,
					description: input.description
				},
				input.userId
			);
		} catch (error) {
			logger.error('Failed to create project', error as Error, {
				organizationId: input.organizationId,
				userId: input.userId
			});
			throw error;
		}
	});

const update = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string(),
			data: projectUpdateSchema
		})
	)
	.handler(async ({ input }) => {
		try {
			return await folderService.updateProject(input.projectId, input.organizationId, input.data);
		} catch (error) {
			logger.error('Failed to update project', error as Error, {
				projectId: input.projectId,
				organizationId: input.organizationId
			});
			throw error;
		}
	});

const updateForm = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string(),
			name: z.string().min(1, 'Project name is required').max(255, 'Project name is too long'),
			url: z
				.union([z.string().url('Invalid URL format').max(500, 'URL is too long'), z.literal('')])
				.optional()
		})
	)
	.handler(async ({ input }) => {
		try {
			return await folderService.updateProject(input.projectId, input.organizationId, {
				name: input.name,
				url: input.url === '' ? undefined : input.url
			});
		} catch (error) {
			logger.error('Failed to update project', error as Error, {
				projectId: input.projectId,
				organizationId: input.organizationId
			});
			throw error;
		}
	});

const remove = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		try {
			await folderService.deleteProject(input.projectId, input.organizationId);
			return { success: true };
		} catch (error) {
			logger.error('Failed to delete project', error as Error, {
				projectId: input.projectId,
				organizationId: input.organizationId
			});
			throw error;
		}
	});

const restore = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		try {
			await folderService.restoreProject(input.projectId, input.organizationId);
			return { success: true };
		} catch (error) {
			logger.error('Failed to restore project', error as Error, {
				projectId: input.projectId,
				organizationId: input.organizationId
			});
			throw error;
		}
	});

export const projectsRouter = {
	list,
	listDeleted,
	get,
	create,
	update,
	updateForm,
	delete: remove,
	restore
};
