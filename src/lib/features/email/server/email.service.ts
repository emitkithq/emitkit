import type { Component } from 'svelte';
import { Renderer } from 'better-svelte-email';
import { dev } from '$app/environment';
import type { BentoClient, BentoTransactionalEmail } from '$lib/server/bento';
import { createContextLogger } from '$lib/server/logger';
import { emailConfig } from '../components/email.config';

type SingleEmailOptions<Props extends Record<string, unknown> = Record<string, unknown>> = {
	to: string;
	subject: string;
	component: Component<Props>;
	props: Props;
	from?: string;
	replyTo?: string;
};

type BatchEmailOptions<Props extends Record<string, unknown> = Record<string, unknown>> =
	SingleEmailOptions<Props>[];

type EmailServiceConfig = {
	bentoClient: BentoClient;
	defaultFrom: string;
	defaultReplyTo?: string;
};

export class EmailService {
	private bentoClient: BentoClient;
	private defaultFrom: string;
	private defaultReplyTo?: string;
	private logger = createContextLogger('email-service');
	private renderer: Renderer;

	constructor(config: EmailServiceConfig) {
		this.bentoClient = config.bentoClient;
		this.defaultFrom = config.defaultFrom;
		this.defaultReplyTo = config.defaultReplyTo;

		// Initialize renderer with Tailwind config
		const tailwindConfig = {
			theme: {
				extend: {
					colors: {
						brand: emailConfig.colors?.primary || '#ce5d2f'
					}
				}
			}
		};
		this.renderer = new Renderer(tailwindConfig);
	}

	private async toHtml<Props extends Record<string, unknown>>(
		component: Component<Props>,
		props: Props
	) {
		return await this.renderer.render(component, { props });
	}

	async sendEmail<Props extends Record<string, unknown>>(options: SingleEmailOptions<Props>) {
		const operation = this.logger.start('Send email', {
			subject: options.subject,
			to: options.to
		});

		if (!this.bentoClient.isEnabled()) {
			this.logger.warn('Bento disabled; skipping sendEmail', {
				subject: options.subject,
				to: options.to
			});
			operation.end({ skipped: true });
			return { skipped: true };
		}

		if (options.replyTo || this.defaultReplyTo) {
			this.logger.warn(
				'replyTo is set but Bento transactional API does not currently accept reply_to; value will be ignored'
			);
		}

		try {
			operation.step('Rendering email template');
			const html = await this.toHtml(options.component, options.props);

			if (dev) {
				this.logger.info('Rendered email HTML', {
					subject: options.subject,
					to: options.to,
					htmlLength: html.length
				});
			}

			const email: BentoTransactionalEmail = {
				to: options.to,
				from: options.from ?? this.defaultFrom,
				subject: options.subject,
				html_body: html,
				transactional: true
			};

			operation.step('Sending via Bento');
			const sentCount = await this.bentoClient.sendTransactionalEmail(email);

			operation.end({ count: sentCount });
			return { sent: true, count: sentCount };
		} catch (error) {
			operation.error('Failed to send email', error, {
				subject: options.subject,
				to: options.to
			});
			throw error;
		}
	}

	async sendBatch<Props extends Record<string, unknown>>(batch: BatchEmailOptions<Props>) {
		if (batch.length === 0) return { sent: false };

		const operation = this.logger.start('Send email batch', {
			batchSize: batch.length
		});

		if (!this.bentoClient.isEnabled()) {
			this.logger.warn('Bento disabled; skipping sendBatch', {
				batchSize: batch.length
			});
			operation.end({ skipped: true });
			return { skipped: true };
		}

		try {
			operation.step('Rendering email templates', { count: batch.length });
			const emails: BentoTransactionalEmail[] = await Promise.all(
				batch.map(async (options) => {
					const html = await this.toHtml(options.component, options.props);
					if (dev) {
						this.logger.info('Rendered batch email HTML', {
							subject: options.subject,
							to: options.to,
							htmlLength: html.length
						});
					}

					return {
						to: options.to,
						from: options.from ?? this.defaultFrom,
						subject: options.subject,
						html_body: html,
						transactional: true
					};
				})
			);

			operation.step('Sending batch via Bento', { emailCount: emails.length });
			const sentCount = await this.bentoClient.sendTransactionalEmailBatch(emails);

			operation.end({ count: sentCount });
			return { sent: true, count: sentCount };
		} catch (error) {
			operation.error('Failed to send batch', error, {
				batchSize: batch.length
			});
			throw error;
		}
	}
}

export type { SingleEmailOptions, BatchEmailOptions };
