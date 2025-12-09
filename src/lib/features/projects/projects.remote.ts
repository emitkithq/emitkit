import { z } from 'zod';
import { command, form, query } from '$app/server';
import { projectCreateSchema, projectUpdateSchema, projectListParamsSchema } from './validators';
import * as folderRepo from './server/repository';
import * as folderService from './server/service';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('projects-remote');

export const listProjectsQuery = query(projectListParamsSchema, async (input) => {
	return await folderRepo.listProjectsByOrg(input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

export const listDeletedProjectsQuery = query(projectListParamsSchema, async (input) => {
	return await folderRepo.listDeletedProjectsByOrg(input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

const getProjectSchema = z.object({
	projectId: z.string(),
	organizationId: z.string(),
	userId: z.string()
});

export const getProjectQuery = query(getProjectSchema, async (input) => {
	return await folderService.getProject(input.projectId, input.organizationId);
});

const createProjectWithUserSchema = projectCreateSchema.extend({
	userId: z.string()
});

export const createProjectCommand = command(createProjectWithUserSchema, async (input) => {
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
		logger.error('Command failed', error as Error, {
			action: 'createProject',
			organizationId: input.organizationId,
			userId: input.userId
		});
		throw error;
	}
});

const updateProjectSchema = z.object({
	projectId: z.string(),
	organizationId: z.string(),
	data: projectUpdateSchema
});

export const updateProjectCommand = command(updateProjectSchema, async (input) => {
	try {
		return await folderService.updateProject(input.projectId, input.organizationId, input.data);
	} catch (error) {
		logger.error('Command failed', error as Error, {
			action: 'updateProject',
			projectId: input.projectId,
			organizationId: input.organizationId
		});
		throw error;
	}
});

const updateProjectFormSchema = z.object({
	projectId: z.string(),
	organizationId: z.string(),
	name: z.string().min(1, 'Project name is required').max(255, 'Project name is too long'),
	url: z
		.union([z.string().url('Invalid URL format').max(500, 'URL is too long'), z.literal('')])
		.optional()
});

export const updateProjectForm = form(updateProjectFormSchema, async (input) => {
	try {
		return await folderService.updateProject(input.projectId, input.organizationId, {
			name: input.name,
			url: input.url === '' ? undefined : input.url
		});
	} catch (error) {
		logger.error('Form submission failed', error as Error, {
			action: 'updateProject',
			projectId: input.projectId,
			organizationId: input.organizationId
		});
		throw error;
	}
});

const deleteProjectSchema = z.object({
	projectId: z.string(),
	organizationId: z.string()
});

export const deleteProjectCommand = command(deleteProjectSchema, async (input) => {
	try {
		await folderService.deleteProject(input.projectId, input.organizationId);
		return { success: true };
	} catch (error) {
		logger.error('Command failed', error as Error, {
			action: 'deleteProject',
			projectId: input.projectId,
			organizationId: input.organizationId
		});
		throw error;
	}
});

const restoreProjectSchema = z.object({
	projectId: z.string(),
	organizationId: z.string()
});

export const restoreProjectCommand = command(restoreProjectSchema, async (input) => {
	try {
		await folderService.restoreProject(input.projectId, input.organizationId);
		return { success: true };
	} catch (error) {
		logger.error('Command failed', error as Error, {
			action: 'restoreProject',
			projectId: input.projectId,
			organizationId: input.organizationId
		});
		throw error;
	}
});
