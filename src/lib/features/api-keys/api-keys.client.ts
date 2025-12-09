import { authClient } from '$lib/client/auth/auth-client';
import type { ApiKeyWithProject } from './types';
import type { Project } from '$lib/server/db/schema';

export async function listApiKeysWithProjects(projects: Project[]): Promise<ApiKeyWithProject[]> {
	const { data, error } = await authClient.apiKey.list();

	if (error || !data) {
		console.error('Failed to fetch API keys:', error);
		return [];
	}

	const keysWithProjects: ApiKeyWithProject[] = data.map((key) => {
		const metadata = key.metadata as { projectId?: string; orgId?: string; projectName?: string };

		if (!metadata?.projectId) {
			return {
				...key,
				project: null
			} as ApiKeyWithProject;
		}

		// Find matching project from the projects array
		const project = projects.find((p) => p.id === metadata.projectId);

		return {
			...key,
			project: project
				? {
						id: project.id,
						name: project.name,
						slug: project.slug,
						organizationId: project.organizationId
					}
				: null
		} as ApiKeyWithProject;
	});

	return keysWithProjects;
}
