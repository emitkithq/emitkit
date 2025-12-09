import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { emailList, createEmail } from 'better-svelte-email/preview';
import { Renderer } from 'better-svelte-email';
import { emailService } from '$lib/features/email/server/index.js';
import type { Component } from 'svelte';
import type { Actions } from './$types';

import WelcomeEmail from '$lib/features/email/components/welcome-email.svelte';
import MagicLoginLink from '$lib/features/email/components/magic-login-link.svelte';
import { emailConfig } from '$lib/features/email/components/email.config';

const tailwindConfig = {
	theme: {
		extend: {
			colors: {
				brand: emailConfig.colors?.primary || '#ce5d2f'
			}
		}
	}
};

const renderer = new Renderer(tailwindConfig);

// Email template configurations
type TemplateConfig = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: any;
	subject: string;
	getProps: () => unknown;
};

const EMAIL_TEMPLATES: Record<string, TemplateConfig> = {
	'welcome-email': {
		component: WelcomeEmail,
		subject: `Welcome to ${emailConfig.appName}!`,
		getProps: () => ({ firstName: 'Developer' })
	},
	'magic-login-link': {
		component: MagicLoginLink,
		subject: `Sign in to ${emailConfig.appName}`,
		getProps: () => ({
			email: 'user@example.com',
			url: `${emailConfig.baseUrl}/auth/verify?token=test-magic-link-token`
		})
	}
} as const;

export function load() {
	if (!dev) error(404, 'Not found');

	const emails = emailList({
		path: '/src/lib/features/email/components'
	});

	return { emails };
}

export const actions: Actions = {
	...createEmail({ renderer }),
	// Custom send email action using Bento
	'send-email': async (event) => {
		const data = await event.request.formData();
		const file = (data.get('file') as string | null) || '';
		const to = (data.get('to') as string | null) || '';
		const emailTemplate = file.replace('.svelte', '').split('/').pop() || '';

		if (!to || !emailTemplate) {
			return { success: false, error: 'Email address and template are required' };
		}

		const templateConfig = EMAIL_TEMPLATES[emailTemplate];
		if (!templateConfig) {
			return { success: false, error: 'Invalid email template' };
		}

		try {
			const props = templateConfig.getProps();

			const result = await emailService.sendEmail({
				to,
				subject: templateConfig.subject,
				component: templateConfig.component as Component<Record<string, unknown>>,
				props: props as Record<string, unknown>
			});

			if (result.skipped) {
				return {
					success: false,
					error:
						'Email skipped: Bento is not configured. Check BENTO_PUBLISHABLE_KEY, BENTO_SECRET_KEY, and BENTO_SITE_UUID env vars.'
				};
			}

			return {
				success: true,
				message: `Test email sent successfully to ${to}!`
			};
		} catch (err) {
			console.error('[EmailPreview] Send failed', err);
			return {
				success: false,
				error: `Failed to send email: ${err instanceof Error ? err.message : 'Unknown error'}`
			};
		}
	}
};
