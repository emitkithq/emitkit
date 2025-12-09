import { relations } from 'drizzle-orm';
import { pgTable, index, unique } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';

export const funnel = pgTable('funnel', (t) => ({
	id: t
		.text('id')
		.$defaultFn(() => createBetterAuthId('funnel'))
		.notNull()
		.primaryKey(),
	organizationId: t
		.text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	name: t.varchar('name', { length: 255 }).notNull(),
	description: t.text('description'),
	createdAt: t.timestamp('created_at').notNull().defaultNow(),
	updatedAt: t.timestamp('updated_at').notNull().defaultNow()
}));

export const funnelStep = pgTable(
	'funnel_step',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('funnel_step'))
			.notNull()
			.primaryKey(),
		funnelId: t
			.text('funnel_id')
			.notNull()
			.references(() => funnel.id, { onDelete: 'cascade' }),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		eventKey: t.varchar('event_key', { length: 255 }).notNull(),
		stepOrder: t.integer('step_order').notNull(),
		name: t.varchar('name', { length: 255 }).notNull(),
		createdAt: t.timestamp('created_at').notNull().defaultNow()
	}),
	(table) => ({
		uniqueFunnelStepOrder: unique().on(table.funnelId, table.stepOrder)
	})
);

export const funnelProgress = pgTable(
	'funnel_progress',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('funnel_progress'))
			.notNull()
			.primaryKey(),
		funnelId: t
			.text('funnel_id')
			.notNull()
			.references(() => funnel.id, { onDelete: 'cascade' }),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: t.varchar('user_id', { length: 255 }).notNull(),
		currentStep: t.integer('current_step').notNull().default(0),
		completed: t.boolean('completed').default(false).notNull(),
		startedAt: t.timestamp('started_at').notNull().defaultNow(),
		completedAt: t.timestamp('completed_at'),
		updatedAt: t.timestamp('updated_at').notNull().defaultNow()
	}),
	(table) => ({
		uniqueFunnelUser: unique().on(table.funnelId, table.userId),
		idxFunnelUser: index('idx_funnel_progress_funnel_user').on(table.funnelId, table.userId)
	})
);

export const funnelRelations = relations(funnel, ({ one, many }) => ({
	organization: one(organization, {
		fields: [funnel.organizationId],
		references: [organization.id]
	}),
	steps: many(funnelStep),
	progress: many(funnelProgress)
}));

export const funnelStepRelations = relations(funnelStep, ({ one }) => ({
	funnel: one(funnel, {
		fields: [funnelStep.funnelId],
		references: [funnel.id]
	}),
	organization: one(organization, {
		fields: [funnelStep.organizationId],
		references: [organization.id]
	})
}));

export const funnelProgressRelations = relations(funnelProgress, ({ one }) => ({
	funnel: one(funnel, {
		fields: [funnelProgress.funnelId],
		references: [funnel.id]
	}),
	organization: one(organization, {
		fields: [funnelProgress.organizationId],
		references: [organization.id]
	})
}));

export type Funnel = typeof funnel.$inferSelect;
export type FunnelInsert = typeof funnel.$inferInsert;
export type FunnelUpdate = Partial<Omit<FunnelInsert, 'organizationId'>>;

export type FunnelStep = typeof funnelStep.$inferSelect;
export type FunnelStepInsert = typeof funnelStep.$inferInsert;

export type FunnelProgress = typeof funnelProgress.$inferSelect;
export type FunnelProgressInsert = typeof funnelProgress.$inferInsert;
