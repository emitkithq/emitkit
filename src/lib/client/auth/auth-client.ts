import {
	adminClient,
	apiKeyClient,
	inferAdditionalFields,
	multiSessionClient,
	organizationClient,
	emailOTPClient
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import type { AuthConfig } from '$lib/server/auth';
import { ac, admin as adminRole, member as memberRole, owner, viewer } from './permissions';

const baseAuthClient = createAuthClient({
	plugins: [
		inferAdditionalFields<AuthConfig>(),
		adminClient(),
		emailOTPClient(),
		organizationClient({
			ac, // Pass access control to client
			roles: {
				owner,
				admin: adminRole,
				member: memberRole,
				viewer
			},
			dynamicAccessControl: {
				enabled: true // Enable dynamic role creation on client
			}
		}),
		multiSessionClient(),
		apiKeyClient()
	]
	// baseURL will use browser's current origin by default
});

// Wrap the authClient to inject userType from URL during signup
export const authClient = new Proxy(baseAuthClient, {
	get(target, prop) {
		if (prop === 'signUp') {
			return new Proxy(target.signUp, {
				get(signUpTarget, signUpProp) {
					if (signUpProp === 'email') {
						return async (options: any) => {
							// Get userType from URL if available
							const params = new URLSearchParams(window.location.search);
							const userType = params.get('userType') || 'talent';

							// Inject userType into the signup request
							return signUpTarget.email({
								...options,
								userType
							});
						};
					}
					return signUpTarget[signUpProp as keyof typeof signUpTarget];
				}
			});
		}
		return target[prop as keyof typeof target];
	}
});

export type AuthClient = typeof baseAuthClient;

export type Session = AuthClient['$Infer']['Session'] | null;
export type User = AuthClient['$Infer']['Session']['user'] | null;
