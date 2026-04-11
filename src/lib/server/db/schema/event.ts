import { relations } from 'drizzle-orm';
import { pgTable, index } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { channel } from './channel';
import { project } from './project';
import { organization } from './auth';

export const event = pgTable(
	'event',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('event'))
			.notNull()
			.primaryKey(),
		channelId: t
			.text('channel_id')
			.notNull()
			.references(() => channel.id, { onDelete: 'cascade' }),
		projectId: t
			.text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		title: t.varchar('title', { length: 500 }).notNull(),
		description: t.text('description'),
		icon: t.varchar('icon', { length: 50 }),
		tags: t.jsonb('tags').$type<string[]>().notNull().default([]),
		metadata: t.jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
		userId: t.text('user_id'),
		notify: t.boolean('notify').notNull().default(true),
		source: t.varchar('source', { length: 50 }).notNull().default('api'),
		createdAt: t.timestamp('created_at').notNull().defaultNow()
	}),
	(table) => [
		index('event_org_created_idx').on(table.organizationId, table.createdAt),
		index('event_channel_created_idx').on(table.channelId, table.createdAt),
		index('event_project_created_idx').on(table.projectId, table.createdAt)
	]
);

export const eventRelations = relations(event, ({ one }) => ({
	channel: one(channel, {
		fields: [event.channelId],
		references: [channel.id]
	}),
	project: one(project, {
		fields: [event.projectId],
		references: [project.id]
	}),
	organization: one(organization, {
		fields: [event.organizationId],
		references: [organization.id]
	})
}));
