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

export {};
