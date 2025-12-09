import { resolve } from '$app/paths';
import type { page } from '$app/state';
import type { ResolvedPathname } from '$app/types';
import type { RouteId } from '$app/types';

/**
 * Helper function to create route paths with optional search params
 * Type-safe with SvelteKit's RouteId system
 */
function createRoute(
	route: RouteId,
	paramsOrSearch?: Record<string, string | number>,
	searchParams?: Record<string, string>
): string {
	let resolvedPath: string;
	let finalSearchParams: Record<string, string> | undefined;

	// Determine if we have route params
	if (searchParams !== undefined) {
		// Three args: route, params, searchParams
		// @ts-expect-error - params structure varies by route
		resolvedPath = resolve(route, paramsOrSearch);
		finalSearchParams = searchParams;
	} else if (
		paramsOrSearch &&
		typeof paramsOrSearch === 'object' &&
		Object.keys(paramsOrSearch).length > 0
	) {
		// Two args: could be (route, params) or (route, searchParams)
		// If route needs params (like /auth/[path]), first arg is params
		// Otherwise, it's searchParams
		const routeStr = String(route);
		const hasPathParam = routeStr.includes('[path]') && 'path' in paramsOrSearch;

		if (hasPathParam) {
			// @ts-expect-error - params structure varies by route
			resolvedPath = resolve(route, paramsOrSearch);
			finalSearchParams = undefined;
		} else {
			// @ts-expect-error - route may or may not need params
			resolvedPath = resolve(route);
			finalSearchParams = paramsOrSearch as Record<string, string>;
		}
	} else {
		// One arg: just route
		// @ts-expect-error - route may or may not need params
		resolvedPath = resolve(route);
		finalSearchParams = undefined;
	}

	if (!finalSearchParams || Object.keys(finalSearchParams).length === 0) {
		return resolvedPath;
	}

	const query = new URLSearchParams(finalSearchParams).toString();
	return `${resolvedPath}?${query}`;
}

/**
 * Type-safe routes with consistent function-based API.
 *
 * Benefits:
 * - Full IntelliSense for all routes
 * - TypeScript enforces correct parameters
 * - Compile-time validation of route existence
 * - Centralized route management
 * - Consistent API - every route is a function
 * - Flexible - any route can accept search params
 */
export const routes = {
	// Home
	home: (searchParams?: Record<string, string>) => createRoute('/(session)', searchParams)
} as const;

/**
 * Helper function to create auth route paths with optional search params
 */
function authPath(path: string, searchParams?: Record<string, string>) {
	const basePath = resolve(`/auth/${path}`);

	if (searchParams && Object.keys(searchParams).length > 0) {
		const query = new URLSearchParams(searchParams).toString();
		return `${basePath}?${query}`;
	}

	return basePath;
}

/**
 * Auth routes with consistent function-based API
 */
export const authRoutes = {
	getStarted: (searchParams?: Record<string, string>) => authPath('get-started', searchParams),
	signIn: (searchParams?: Record<string, string>) => authPath('sign-in', searchParams),
	signUp: (searchParams?: Record<string, string>) => authPath('sign-up', searchParams),
	forgotPassword: (searchParams?: Record<string, string>) =>
		authPath('forgot-password', searchParams),
	resetPassword: (searchParams?: Record<string, string>) => authPath('reset-password', searchParams)
} as const;

/**
 * Check if a given path matches a route (ignoring search params)
 * Useful for active link styling and conditional rendering
 *
 * @param currentPath - The current path to check (e.g., from page.url.pathname)
 * @param targetRoute - The route to match against (from routes or authRoutes)
 * @returns true if the paths match (excluding search params)
 *
 * @example
 * // In a component with page
 * const isActive = $derived(isRouteActive(page.url.pathname, routes.home()));
 *
 * @example
 * // Check against multiple routes
 * const isAuthPage = $derived(isRouteActive(page.url.pathname, authRoutes.signIn()) ||
 *                 isRouteActive(page.url.pathname, authRoutes.signUp()));
 */
export function isRouteActive(pageObj: typeof page, targetPath: ResolvedPathname): boolean {
	return pageObj.url.pathname === targetPath;
}

/**
 * Check if the current path starts with a given route (useful for nested routes)
 *
 * @param currentPath - The current path to check
 * @param targetRoute - The route prefix to match against
 * @returns true if currentPath starts with targetRoute
 *
 * @example
 * // Check if we're anywhere in the auth section
 * $: isInAuth = isRoutePrefix(page.url.pathname, '/auth');
 */
export function isRoutePrefix(currentPath: string, targetRoute: string): boolean {
	const cleanCurrentPath = currentPath.split('?')[0];
	const cleanTargetRoute = targetRoute.split('?')[0];

	return cleanCurrentPath.startsWith(cleanTargetRoute);
}

/**
 * Convenience paths (backward compatibility)
 */

export const signUpPath = authRoutes.getStarted();

/**
 * Example usage with full type safety:
 *
 * // Simple route (no params required)
 * routes.home() // ✅ '/(public)'
 *
 * // Route with params (params REQUIRED and type-checked)
 * routes.auth({ path: 'sign-in' }) // ✅ '/auth/sign-in'
 * routes.auth() // ❌ TypeScript error - missing required param
 * routes.auth({ wrong: 'sign-in' }) // ❌ TypeScript error - wrong param name
 *
 * // With search params
 * routes.auth({ path: 'sign-up' }, { userType: 'talent' })
 * // ✅ '/auth/sign-up?userType=talent'
 *
 * // Using helper functions
 * authRoutes.signIn() // ✅ '/auth/sign-in'
 * authRoutes.signUp({ userType: 'talent', callbackUrl: '/dashboard' })
 * // ✅ '/auth/sign-up?userType=talent&callbackUrl=%2Fdashboard'
 */
