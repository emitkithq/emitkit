import {
	BENTO_DEFAULT_FROM,
	BENTO_REPLY_TO,
	BENTO_PUBLISHABLE_KEY,
	BENTO_SECRET_KEY,
	BENTO_SITE_UUID
} from '$env/static/private';
import { BentoClient } from '$lib/server/bento.js';
import { EmailService } from '$lib/features/email/server/email.service.js';

const bentoClient = new BentoClient({
	publishableKey: BENTO_PUBLISHABLE_KEY,
	secretKey: BENTO_SECRET_KEY,
	siteUuid: BENTO_SITE_UUID
});

const defaultFrom = BENTO_DEFAULT_FROM || 'EmitKit <noreply@emitkit.com>';
const defaultReplyTo = BENTO_REPLY_TO || 'support@emitkit.com';

export const emailService = new EmailService({
	bentoClient,
	defaultFrom,
	defaultReplyTo
});

export { bentoClient };

export { default as OTPEmail } from '../components/otp-email.svelte';
export { default as WelcomeEmail } from '../components/welcome-email.svelte';
export { default as ResetPasswordEmail } from '../components/reset-password-email.svelte';
export { default as ConfirmSubscriptionEmail } from '../components/confirm-subscription-email.svelte';
