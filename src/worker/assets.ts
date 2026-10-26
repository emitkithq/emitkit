import type { Env } from "@server/platform/env";

export type StaticSurface = "app" | "www";

const hasExtension = (pathname: string) => /\.[a-z0-9]+$/iu.test(pathname);

/**
 * Paths that already name a build/dev location: files under a surface folder,
 * and Vite's dev-server URLs (`/@vite/client`, `/@fs/…`, `/node_modules/…`).
 * They are served as-is instead of being prefixed with the surface.
 */
const PASSTHROUGH = /^\/(?:app|www|ui)\/|^\/@|^\/node_modules\/|^\/__/u;

/** The docs site (docs/, built by Blume) is mounted at `/docs` on the site host. */
const DOCS_PREFIX = "/docs";

const inDocs = (pathname: string) =>
  pathname === DOCS_PREFIX || pathname.startsWith(`${DOCS_PREFIX}/`);

/** Blume's `.md`, `.mdx` and `.txt` files are UTF-8; say so, or browsers guess Windows-1252. */
const TEXT_TYPES = /^text\/(?:markdown|plain)\b(?!.*charset)/iu;

const withCharset = (response: Response) => {
  const type = response.headers.get("content-type") ?? "";
  if (!TEXT_TYPES.test(type)) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("content-type", `${type}; charset=utf-8`);
  return new Response(response.body, { headers, status: response.status });
};

/** Built from `web/ui/visits-page.ts` (see vite.config.ts); served from source in dev. */
const VISITS_SCRIPT = import.meta.env.DEV ? "/ui/visits-page.ts" : "/www/ek.js";

const wantsHtml = (request: Request) =>
  request.method === "GET" &&
  (request.headers.get("accept") ?? "").includes("text/html");

const fetchAsset = (env: Env, request: Request, path: string) =>
  env.ASSETS.fetch(
    new Request(new URL(path, request.url), {
      headers: request.headers,
      method: request.method,
    })
  );

/**
 * Both frontends learn the deployment's hostnames from meta tags injected
 * here (`emitkit:app-url`, `emitkit:api-url`, `emitkit:site-url`), so any
 * hostname setup works without rebuilding the client. The optional
 * `emitkit:parsew-key` is a publishable key: browsers put it in image URLs.
 * With operator telemetry set up, `emitkit:openpanel-client-id` (browser-
 * public, unlike the secret) turns on page views (`web/ui/visits.ts`): the
 * PWA loads them itself, the site and docs get the page-view script.
 */
const withRuntimeConfig = (
  response: Response,
  env: Env,
  surface: StaticSurface
) => {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    return response;
  }
  const tags = [
    ["emitkit:app-url", env.APP_URL],
    ["emitkit:api-url", env.API_URL],
    ["emitkit:site-url", env.SITE_URL ?? ""],
    ["emitkit:parsew-key", env.PARSEW_PUBLISHABLE_KEY ?? ""],
    ["emitkit:openpanel-client-id", env.TELEMETRY_OPENPANEL_CLIENT_ID ?? ""],
    ["emitkit:openpanel-api-url", env.TELEMETRY_OPENPANEL_API_URL ?? ""],
  ]
    .filter(([, content]) => content !== "")
    .map(([name, content]) => `<meta name="${name}" content="${content}">`)
    .join("");
  const visits =
    surface === "www" && env.TELEMETRY_OPENPANEL_CLIENT_ID
      ? `<script type="module" src="${VISITS_SCRIPT}"></script>`
      : "";
  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.prepend(tags, { html: true });
        head.append(visits, { html: true });
      },
    })
    .transform(response);
};

/**
 * Serves one frontend's files. Built HTML lives under `/app/**` and `/www/**`
 * (hashed chunks under the shared `/assets/**` never reach the Worker), so the
 * surface prefix is added here. Extension-less paths resolve to prerendered
 * `index.html` files; the PWA falls back to its shell for client routes.
 */
const serveFile = async (
  request: Request,
  env: Env,
  surface: StaticSurface
) => {
  const { pathname } = new URL(request.url);
  if (PASSTHROUGH.test(pathname)) {
    return fetchAsset(
      env,
      request,
      `${pathname}${new URL(request.url).search}`
    );
  }
  if (hasExtension(pathname)) {
    return fetchAsset(env, request, `/${surface}${pathname}`);
  }
  const directory = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const page = await fetchAsset(
    env,
    request,
    `/${surface}${directory}index.html`
  );
  if (page.status !== 404) {
    return page;
  }
  if (surface === "www" && inDocs(pathname) && !pathname.endsWith("/")) {
    // Extension-less files such as /docs/.well-known/api-catalog.
    const file = await fetchAsset(env, request, `/www${pathname}`);
    if (file.status !== 404) {
      return file;
    }
  }
  if (!wantsHtml(request)) {
    return page;
  }
  if (surface === "app") {
    return fetchAsset(env, request, "/app/index.html");
  }
  const notFound = await fetchAsset(
    env,
    request,
    inDocs(pathname) ? "/www/docs/404.html" : "/www/404/index.html"
  );
  return new Response(notFound.body, {
    headers: notFound.headers,
    status: 404,
  });
};

export const serveStatic = async (
  request: Request,
  env: Env,
  surface: StaticSurface
) =>
  withRuntimeConfig(
    withCharset(await serveFile(request, env, surface)),
    env,
    surface
  );
