import { relations } from 'drizzle-orm';
import { pgTable } from 'drizzle-orm/pg-core';
import { createBetterAuthId } from './utils';
import { organization } from './auth';

export const subscription = pgTable('subscription', (t) => ({
	id: t
		.text('id')
		.$defaultFn(() => createBetterAuthId('subscription'))
		.notNull()
		.primaryKey(),
	organizationId: t
		.text('organization_id')
		.notNull()
		.unique() // One subscription per organization
		.references(() => organization.id, { onDelete: 'cascade' }),
	subscriptionId: t.text('subscription_id').notNull().unique(), // Polar subscription ID
	productId: t.text('product_id').notNull(), // Polar product ID (for feature gating)
	status: t.text('status').notNull(), // active, canceled, past_due, trialing, etc. (cached from webhooks)
	createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: t.timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}));

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const subscriptionRelations = relations(subscription, ({ one }) => ({
	organization: one(organization, {
		fields: [subscription.organizationId],
		references: [organization.id]
	})
}));

// -----------------------------------------------------------------------------
// Inferred Types
// -----------------------------------------------------------------------------

export type Subscription = typeof subscription.$inferSelect;
export type SubscriptionInsert = typeof subscription.$inferInsert;
