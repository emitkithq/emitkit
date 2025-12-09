import { Analytics } from '@bentonow/bento-node-sdk';
import { dev } from '$app/environment';
import { createContextLogger } from '$lib/server/logger';

type BentoConfig = {
	publishableKey?: string;
	secretKey?: string;
	siteUuid?: string;
};

type BentoTransactionalEmail = {
	to: string;
	from: string;
	subject: string;
	html_body: string;
	transactional: true;
};

type BentoSubscriberUpsert = {
	email: string;
	tags?: string[];
	removeTags?: string[];
};

export class BentoClient {
	private client: Analytics | null = null;
	private enabled = false;
	private logger = createContextLogger('bento-client');

	constructor(config: BentoConfig) {
		if (dev) {
			this.logger.info('Initializing with config', {
				hasPublishableKey: !!config.publishableKey,
				hasSecretKey: !!config.secretKey,
				hasSiteUuid: !!config.siteUuid
			});
		}

		if (config.publishableKey && config.secretKey && config.siteUuid) {
			this.enabled = true;
			this.client = new Analytics({
				authentication: {
					publishableKey: config.publishableKey,
					secretKey: config.secretKey
				},
				siteUuid: config.siteUuid,
				logErrors: true
			});
			if (dev) this.logger.success('Client initialized successfully');
		} else {
			this.logger.warn('Missing config - client disabled');
		}
	}

	public isEnabled() {
		return this.enabled;
	}

	public async sendTransactionalEmail(email: BentoTransactionalEmail) {
		const operation = this.logger.start('Send transactional email', {
			to: email.to,
			from: email.from,
			subject: email.subject,
			enabled: this.enabled
		});

		if (!this.enabled || !this.client) {
			const error = new Error(
				'Bento client is disabled. Provide publishable/secret keys and site UUID.'
			);
			operation.error('Client disabled', error);
			throw error;
		}

		try {
			const response = await this.client.V1.Batch.sendTransactionalEmails({
				emails: [email]
			});
			operation.end({ count: response });
			return response;
		} catch (error) {
			operation.error('Failed to send email', error);
			throw error;
		}
	}

	public async sendTransactionalEmailBatch(emails: BentoTransactionalEmail[]) {
		const operation = this.logger.start('Send transactional email batch', {
			emailCount: emails.length,
			enabled: this.enabled
		});

		if (!this.enabled || !this.client) {
			const error = new Error(
				'Bento client is disabled. Provide publishable/secret keys and site UUID.'
			);
			operation.error('Client disabled', error);
			throw error;
		}

		try {
			const response = await this.client.V1.Batch.sendTransactionalEmails({
				emails
			});
			operation.end({ count: response });
			return response;
		} catch (error) {
			operation.error('Failed to send batch', error);
			throw error;
		}
	}

	public async upsertSubscribers(subscribers: BentoSubscriberUpsert[]) {
		const operation = this.logger.start('Upsert subscribers', {
			subscriberCount: subscribers.length,
			enabled: this.enabled
		});

		if (!this.enabled || !this.client) {
			const error = new Error(
				'Bento client is disabled. Provide publishable/secret keys and site UUID.'
			);
			operation.error('Client disabled', error);
			throw error;
		}

		try {
			// Map to API fields; tags are comma-separated array per Bento docs.
			const payload = subscribers.map((s) => ({
				email: s.email,
				...(s.tags ? { tags: s.tags } : {}),
				...(s.removeTags ? { remove_tags: s.removeTags } : {})
			}));

			const result = await this.client.V1.Batch.importSubscribers({
				// allow remove_tags passthrough
				subscribers: payload as unknown as { email: string; [key: string]: unknown }[]
			});

			operation.end({ result });
			return result;
		} catch (error) {
			operation.error('Failed to upsert subscribers', error);
			throw error;
		}
	}
}

export type { BentoTransactionalEmail, BentoSubscriberUpsert };
