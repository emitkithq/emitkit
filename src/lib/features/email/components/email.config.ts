import { siteConfig } from '$lib/server/site-config';

export const emailConfig = {
	appName: 'EmitKit',
	baseUrl: siteConfig.appUrl,
	// Use full URL for email - relative paths don't work in emails
	wordmarkImg: `${siteConfig.appUrl}/logo-emitkit.png`,
	colors: {
		body: '#f7f7f7',
		bodyEmail: '#ffffff',
		primary: '#ce5d2f',
		primaryForeground: '#ffffff'
	}
};
