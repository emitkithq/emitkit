/**
 * Type Helpers for Feature Type Systems
 *
 * Reusable utility types following the type system template pattern.
 */

/**
 * Utility type for detail views with all relations included
 * @template T - Base type (from database schema)
 * @template R - Relations object
 * @example
 * type ArticleDetailData = DetailItemWithRelations<Article, {
 *   author: Author;
 *   comments: Comment[];
 *   commentCount: number;
 * }>;
 */
export type DetailItemWithRelations<T, R extends Record<string, unknown>> = T & R;

/**
 * Make all nullable fields required (removes null from union types)
 * Useful for components after null checks in page loads
 * @template T - Type with potentially nullable fields
 * @example
 * type ArticleData = NonNullableFields<ArticleWithAuthor>;
 */
export type NonNullableFields<T> = {
	[P in keyof T]: NonNullable<T[P]>;
};

/**
 * Extract only the specified keys from a type
 * Useful for creating update types or partial views
 * @template T - Base type
 * @template K - Keys to pick
 */
export type PickFields<T, K extends keyof T> = Pick<T, K>;

/**
 * Make specified keys partial while keeping others required
 * @template T - Base type
 * @template K - Keys to make partial
 */
export type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
