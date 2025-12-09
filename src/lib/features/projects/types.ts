import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { project, type Project } from '$lib/server/db/schema';

export type { Project, ProjectInsert, ProjectUpdate } from '$lib/server/db/schema';

export const selectProjectSchema = createSelectSchema(project);
export const insertProjectSchema = createInsertSchema(project);

export type { ProjectCreateInput, ProjectUpdateInput, ProjectListParams } from './validators';

export type ProjectListResponse = {
	items: Project[];
	total: number;
};

export type ProjectCreateResponse = {
	project: Project;
	apiKey: {
		id: string;
		key: string; // Full API key (only returned on creation!)
		start: string | null;
		name: string | null;
	};
};
