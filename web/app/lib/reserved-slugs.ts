/**
 * First path segments the dashboard or the Worker already owns on the app
 * host. An organization with one of these slugs would be unreachable at
 * `/<slug>`, so they are never chosen or accepted here.
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "accept-invitation",
  "api",
  "app",
  "assets",
  "auth",
  "getting-started",
  "rpc",
  "www",
]);

export const isReservedSlug = (slug: string): boolean =>
  RESERVED_SLUGS.has(slug);
