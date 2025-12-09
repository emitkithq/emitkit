import { relations } from 'drizzle-orm';
import { pgTable, unique, index } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';
import { channel } from './channel';

export const project = pgTable(
	'project',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('project'))
			.notNull()
			.primaryKey(),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		name: t.varchar('name', { length: 255 }).notNull(),
		slug: t.varchar('slug', { length: 255 }).notNull(),
		url: t.varchar('url', { length: 500 }),
		description: t.text('description'),
		deletedAt: t.timestamp('deleted_at'),
		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		updatedAt: t.timestamp('updated_at').notNull().defaultNow()
	}),
	(table) => ({
		uniqueOrgSlug: unique().on(table.organizationId, table.slug),
		idxOrg: index('idx_projects_org').on(table.organizationId),
		idxDeleted: index('idx_projects_deleted').on(table.deletedAt)
	})
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const projectRelations = relations(project, ({ one, many }) => ({
	organization: one(organization, {
		fields: [project.organizationId],
		references: [organization.id]
	}),
	channels: many(channel)
}));

// -----------------------------------------------------------------------------
// Inferred Types
// -----------------------------------------------------------------------------

export type Project = typeof project.$inferSelect;
export type ProjectInsert = typeof project.$inferInsert;
export type ProjectUpdate = Partial<Omit<ProjectInsert, 'organizationId'>>;
