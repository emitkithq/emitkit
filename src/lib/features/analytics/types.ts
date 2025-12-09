import type { AppEvents, AppEventName, AppEventProperties } from './events';

export type { AppEvents, AppEventName, AppEventProperties };

export interface AnalyticsConfig {
	enabled: boolean;
	debug: boolean;
}

export interface UserIdentity {
	email: string;
	userId?: string;
	name?: string;
	traits?: Record<string, unknown>;
}

export interface PageViewData {
	path: string;
	title?: string;
	referrer?: string;
}
