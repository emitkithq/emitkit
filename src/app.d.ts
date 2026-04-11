import type {
	AuthConfig,
	SessionObj,
	UserObj,
	AuthContext,
	OrganizationObj,
	auth
} from '$lib/server/auth';
import type { Breadcrumb } from '$lib/components/breadcrumbs-provider/breadcrumbs-provider.svelte';

declare global {
	namespace App {
		interface Locals {
			auth: typeof auth;
			user?: UserObj;
			session?: SessionObj['session'];
			activeOrganization?: OrganizationObj;
			activeOrganizationMember?: LocalMember;
			getSession: AuthConfig['api']['getSession'];
			authContext?: AuthContext;
			requestId?: string;
		}
		interface PageData {
			crumbs?: Breadcrumb[];
			orgId: string;
		}
		interface Platform {
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

declare module '$env/static/private' {
	export const VAPID_KEY: string;
	export const VAPID_SUBJECT: string;
	export const BENTO_DEFAULT_FROM: string;
	export const BENTO_REPLY_TO: string;
	export const BENTO_PUBLISHABLE_KEY: string;
	export const BENTO_SECRET_KEY: string;
	export const BENTO_SITE_UUID: string;
	export const ENCRYPTION_KEY: string;
	export const OPENROUTER_API_KEY: string;
	export const UPSTASH_REDIS_REST_TOKEN: string;
	export const UPSTASH_REDIS_REST_URL: string;
	export const QSTASH_TOKEN: string;
	export const QSTASH_URL: string;
	export const TINYBIRD_TOKEN: string;
	export const TINYBIRD_API_URL: string;
}

declare module '$env/static/public' {
	export const PUBLIC_VAPID_KEY: string;
}

export {};
