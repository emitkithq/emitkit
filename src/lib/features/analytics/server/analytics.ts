import { createServerAnalytics } from '@stacksee/analytics/server';
import { dev } from '$app/environment';
import type { AppEvents } from '../events';

export const analytics = createServerAnalytics<AppEvents>({
	providers: [],
	debug: dev,
	enabled: import.meta.env.PROD
});
