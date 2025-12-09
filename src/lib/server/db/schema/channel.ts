import { relations } from 'drizzle-orm';
import { pgTable, index, unique } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';
import { project } from './project';
import { webhook } from './webhook';

export const channel = pgTable(
	'channel',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('channel'))
			.notNull()
			.primaryKey(),
		projectId: t
			.text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		name: t.varchar('name', { length: 255 }).notNull(),
		icon: t.varchar('icon', { length: 50 }),
		description: t.text('description'),
		deletedAt: t.timestamp('deleted_at'),
		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		updatedAt: t.timestamp('updated_at').notNull().defaultNow()
	}),
	(table) => ({
		uniqueProjectName: unique().on(table.projectId, table.name),
		idxProject: index('idx_channels_project').on(table.projectId),
		idxDeleted: index('idx_channels_deleted').on(table.deletedAt)
	})
);

export const channelRelations = relations(channel, ({ one, many }) => ({
	project: one(project, {
		fields: [channel.projectId],
		references: [project.id]
	}),
	organization: one(organization, {
		fields: [channel.organizationId],
		references: [organization.id]
	}),
	webhooks: many(webhook)
}));

export type Channel = typeof channel.$inferSelect;
export type ChannelInsert = typeof channel.$inferInsert;
export type ChannelUpdate = Partial<Omit<ChannelInsert, 'projectId' | 'organizationId'>>;
