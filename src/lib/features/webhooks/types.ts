import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { webhook, type Webhook } from '$lib/server/db/schema';

export type { Webhook, WebhookInsert } from '$lib/server/db';

export const selectWebhookSchema = createSelectSchema(webhook);
export const insertWebhookSchema = createInsertSchema(webhook);

export type WebhookUpdate = Partial<Pick<Webhook, 'url' | 'secret' | 'events' | 'enabled'>>;

export type {
	CreateWebhookInput,
	UpdateWebhookInput,
	DeleteWebhookInput,
	ListWebhooksInput,
	WebhookPayload
} from './validators';
