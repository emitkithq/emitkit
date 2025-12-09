import type { PathConfig } from 'better-auth-ui-svelte';

/**
 * Shared authentication configuration
 * Used by both the AuthUIProvider and server-side redirects
 */
export const authPathConfig: PathConfig = {
	basePath: '/auth'
};

/**
 * Protected routes that require authentication
 */
export const PROTECTED_ROUTES = ['/'];

/**
 * Auth routes that should redirect to app if already authenticated
 */
export const AUTH_ROUTES: string[] = ['/auth/sign-in', '/auth/sign-up', '/auth/magic-link'];

/**
 * Default redirect after successful authentication
 */
export const DEFAULT_AUTH_REDIRECT = '/';

/**
 * Home page path
 */
export const HOME_PATH = '/';

/**
 * Account configuration
 */
export const accountConfig = {
	basePath: '/account',
	fields: ['image', 'name']
};
