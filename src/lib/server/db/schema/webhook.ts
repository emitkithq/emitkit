import { relations, sql } from 'drizzle-orm';
import { pgTable, index } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';
import { channel } from './channel';

export const webhook = pgTable(
	'webhook',
	(t) => ({
		id: t
			.text('id')
			.$defaultFn(() => createBetterAuthId('webhook'))
			.notNull()
			.primaryKey(),
		channelId: t
			.text('channel_id')
			.notNull()
			.references(() => channel.id, { onDelete: 'cascade' }),
		organizationId: t
			.text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		url: t.text('url').notNull(),
		secret: t.varchar('secret', { length: 255 }),
		events: t.json('events').$type<string[]>().default(['all']).notNull(),
		enabled: t.boolean('enabled').default(true).notNull(),
		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		updatedAt: t.timestamp('updated_at').notNull().defaultNow()
	}),
	(table) => ({
		idxChannelEnabled: index('idx_webhooks_channel')
			.on(table.channelId)
			.where(sql`${table.enabled} = true`)
	})
);

export const webhookRelations = relations(webhook, ({ one }) => ({
	channel: one(channel, {
		fields: [webhook.channelId],
		references: [channel.id]
	}),
	organization: one(organization, {
		fields: [webhook.organizationId],
		references: [organization.id]
	})
}));

export type Webhook = typeof webhook.$inferSelect;
export type WebhookInsert = typeof webhook.$inferInsert;
