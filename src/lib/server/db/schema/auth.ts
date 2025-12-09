import { createBetterAuthId } from './utils';
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const retentionTierEnum = pgEnum('retention_tier', ['basic', 'premium', 'unlimited']);

export const user = pgTable('user', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('user'))
		.notNull()
		.primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	twoFactorEnabled: boolean('two_factor_enabled').default(false)
});

export const session = pgTable('session', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('session'))
		.notNull()
		.primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	activeOrganizationId: text('active_organization_id')
});

export const account = pgTable('account', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('account'))
		.notNull()
		.primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const verification = pgTable('verification', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('verification'))
		.notNull()
		.primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const apikey = pgTable('apikey', (t) => ({
	id: t
		.text('id')
		.$defaultFn(() => createBetterAuthId('apikey'))
		.notNull()
		.primaryKey(),
	name: t.text('name'),
	start: t.text('start'),
	prefix: t.text('prefix'),
	key: t.text('key').notNull(),
	userId: t
		.text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	refillInterval: t.integer('refill_interval'),
	refillAmount: t.integer('refill_amount'),
	lastRefillAt: t.timestamp('last_refill_at'),
	enabled: t.boolean('enabled'),
	rateLimitEnabled: t.boolean('rate_limit_enabled'),
	rateLimitTimeWindow: t.integer('rate_limit_time_window'),
	rateLimitMax: t.integer('rate_limit_max'),
	requestCount: t.integer('request_count'),
	remaining: t.integer('remaining'),
	lastRequest: t.timestamp('last_request'),
	expiresAt: t.timestamp('expires_at'),
	createdAt: t.timestamp('created_at').notNull(),
	updatedAt: t.timestamp('updated_at').notNull(),
	permissions: t.text('permissions'),
	metadata: t.json('metadata').$type<
		Record<string, unknown> & {
			orgId: string;
			projectId: string;
			projectName?: string;
		}
	>()
}));

export const organizationRole = pgTable('organization_role', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('organization'))
		.notNull()
		.primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	role: text('role').notNull(),
	permission: text('permission').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').$onUpdate(() => /* @__PURE__ */ new Date())
});

export const organization = pgTable('organization', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('organization'))
		.notNull()
		.primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	logo: text('logo'),
	createdAt: timestamp('created_at').notNull(),
	metadata: text('metadata'),
	// Event retention tier (Tinybird)
	// basic: 90 days, premium: 365 days, unlimited: no retention
	retentionTier: retentionTierEnum('retention_tier').default('basic').notNull()
});

export const member = pgTable('member', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('member'))
		.notNull()
		.primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	role: text('role').default('member').notNull(),
	createdAt: timestamp('created_at').notNull()
});

export const invitation = pgTable('invitation', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('invitation'))
		.notNull()
		.primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	email: text('email').notNull(),
	role: text('role'),
	status: text('status').default('pending').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	inviterId: text('inviter_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const twoFactor = pgTable('two_factor', {
	id: text('id')
		.$defaultFn(() => createBetterAuthId('two-factor'))
		.notNull()
		.primaryKey(),
	secret: text('secret').notNull(),
	backupCodes: text('backup_codes').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

// -----------------------------------------------------------------------------
// Drizzle ORM Relations
// -----------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	apikeys: many(apikey),
	memberships: many(member),
	invitations: many(invitation)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, { fields: [apikey.userId], references: [user.id] })
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation)
	// Note: subscription relation will be automatically inferred from subscription.ts
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, { fields: [member.userId], references: [user.id] })
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
	inviter: one(user, { fields: [invitation.inviterId], references: [user.id] })
}));

export const organizationRoleRelations = relations(organizationRole, ({ one }) => ({
	organization: one(organization, {
		fields: [organizationRole.organizationId],
		references: [organization.id]
	})
}));

// -----------------------------------------------------------------------------
// Inferred Types
// -----------------------------------------------------------------------------

export type ApiKey = typeof apikey.$inferSelect;
export type ApiKeyInsert = typeof apikey.$inferInsert;

// -----------------------------------------------------------------------------
// Retention Tier Helper
// -----------------------------------------------------------------------------

/**
 * Get retention days from tier
 * @param tier - Retention tier (basic, premium, unlimited)
 * @returns Number of days or null for unlimited
 */
export function getRetentionDays(tier: 'basic' | 'premium' | 'unlimited'): number | null {
	switch (tier) {
		case 'basic':
			return 90;
		case 'premium':
			return 365;
		case 'unlimited':
			return null; // No retention limit
	}
}
