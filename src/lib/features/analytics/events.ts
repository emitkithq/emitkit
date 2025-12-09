import type { CreateEventDefinition, EventCollection } from '@stacksee/analytics';

export const appEvents = {
	user_signed_out: {
		name: 'user_signed_out',
		category: 'user',
		properties: {} as {
			userId: string;
		}
	},

	user_signed_up: {
		name: 'user_signed_up',
		category: 'conversion',
		properties: {} as {
			userId: string;
			email: string;
			provider?: string;
		}
	},

	// API Events
	api_request_authenticated: {
		name: 'api_request_authenticated',
		category: 'performance',
		properties: {} as {
			organizationId: string;
			apiKeyId: string;
			endpoint: string;
			method: string;
		}
	},
	api_request_failed: {
		name: 'api_request_failed',
		category: 'error',
		properties: {} as {
			organizationId?: string;
			apiKeyId?: string;
			endpoint: string;
			method: string;
			statusCode: number;
			error: string;
			reason?: string;
		}
	},

	// Identity Events
	user_identified: {
		name: 'user_identified',
		category: 'user',
		properties: {} as {
			organizationId: string;
			apiKeyId: string;
			userId: string;
			aliasCount?: number;
			hasProperties: boolean;
		}
	},
	user_identify_failed: {
		name: 'user_identify_failed',
		category: 'error',
		properties: {} as {
			organizationId?: string;
			apiKeyId?: string;
			userId?: string;
			error: string;
			statusCode: number;
		}
	}
} as const satisfies EventCollection<Record<string, CreateEventDefinition<string>>>;

export type AppEvents = typeof appEvents;
export type AppEventName = keyof typeof appEvents;
export type AppEventProperties<T extends AppEventName> = (typeof appEvents)[T]['properties'];
