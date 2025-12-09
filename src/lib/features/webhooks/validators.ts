import { z } from 'zod';

// Validates webhook URL to prevent SSRF attacks
// - Must be HTTP or HTTPS
// - Cannot be localhost or loopback addresses
// - Cannot be private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
const webhookUrlValidator = z
	.string()
	.url('Invalid webhook URL')
	.refine(
		(url) => {
			try {
				const parsed = new URL(url);

				// Must be HTTP or HTTPS
				if (!['http:', 'https:'].includes(parsed.protocol)) {
					return false;
				}

				const hostname = parsed.hostname.toLowerCase();

				// Block localhost and loopback addresses
				if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname)) {
					return false;
				}

				// Block private IP ranges
				if (hostname.match(/^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./)) {
					return false;
				}

				// Block link-local addresses
				if (hostname.match(/^169\.254\./)) {
					return false;
				}

				return true;
			} catch {
				return false;
			}
		},
		{
			message: 'Webhook URL cannot point to localhost, loopback, or private IP addresses'
		}
	);

export const createWebhookSchema = z.object({
	channelId: z.string().min(1, 'Channel ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required'),
	url: webhookUrlValidator,
	secret: z.string().optional().nullable(),
	events: z.array(z.string()).default(['all'])
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
	id: z.string().min(1, 'Webhook ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required'),
	url: webhookUrlValidator.optional(),
	secret: z.string().optional().nullable(),
	events: z.array(z.string()).optional(),
	enabled: z.boolean().optional()
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const deleteWebhookSchema = z.object({
	id: z.string().min(1, 'Webhook ID is required'),
	organizationId: z.string().min(1, 'Organization ID is required')
});

export type DeleteWebhookInput = z.infer<typeof deleteWebhookSchema>;

export const listWebhooksSchema = z.object({
	organizationId: z.string().min(1, 'Organization ID is required'),
	page: z.number().int().positive().optional(),
	limit: z.number().int().positive().max(100).optional()
});

export type ListWebhooksInput = z.infer<typeof listWebhooksSchema>;

export const webhookPayloadSchema = z.object({
	event_id: z.string(),
	channel_id: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	icon: z.string().nullable().optional(),
	tags: z.array(z.string()),
	metadata: z.record(z.string(), z.unknown()),
	user_id: z.string().nullable().optional(),
	created_at: z.string()
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
