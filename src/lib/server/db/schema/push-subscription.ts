import { relations } from 'drizzle-orm';
import { pgTable, index, unique } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization, user } from './auth';

export const pushSubscription = pgTable(
	'push_subscription',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('push_subscription'))
			.notNull()
			.primaryKey(),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: t
			.text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		channelIds: t.json('channel_ids').$type<string[]>().default([]).notNull(),
		endpoint: t.text('endpoint').notNull(),
		p256dhKey: t.text('p256dh_key').notNull(),
		authKey: t.text('auth_key').notNull(),
		createdAt: t.timestamp('created_at').notNull().defaultNow()
	}),
	(table) => ({
		uniqueUserEndpoint: unique().on(table.userId, table.endpoint),
		idxUser: index('idx_push_subscriptions_user').on(table.userId)
	})
);

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
	organization: one(organization, {
		fields: [pushSubscription.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [pushSubscription.userId],
		references: [user.id]
	})
}));

export type PushSubscription = typeof pushSubscription.$inferSelect;
export type PushSubscriptionInsert = typeof pushSubscription.$inferInsert;
