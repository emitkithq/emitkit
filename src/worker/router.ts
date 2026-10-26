import type { Env } from "@server/platform/env";
import { serveStatic } from "@worker/assets";
import { handlePublicApi } from "@worker/public-api";
import { handleAuth, handleBillingWebhook, handleRpc } from "@worker/rpc";

export type Surface = "api" | "app" | "site";

const hostOf = (url: string) => new URL(url).host;

/**
 * The configured hostnames (API_URL, APP_URL, SITE_URL) decide the surface;
 * anything else is the site, or the app when the deployment has no site.
 */
export const surfaceOf = (url: URL, env: Env): Surface => {
  if (url.host === hostOf(env.API_URL)) {
    return "api";
  }
  if (url.host === hostOf(env.APP_URL) || !env.SITE_URL) {
    return "app";
  }
  return "site";
};

/** The site's `www.` and old docs hostnames 301 to the site; neither exists without one. */
const siteRedirect = (url: URL, env: Env): Response | null => {
  const site = env.SITE_URL;
  if (!site) {
    return null;
  }
  if (env.DOCS_HOST && url.host === env.DOCS_HOST) {
    const path = url.pathname === "/" ? "" : url.pathname;
    return Response.redirect(`${site}/docs${path}${url.search}`, 301);
  }
  if (url.host === `www.${hostOf(site)}`) {
    return Response.redirect(`${site}${url.pathname}${url.search}`, 301);
  }
  return null;
};

/** `/api/v1/*` and `/api/openapi.json` alias `/v1/*` and `/openapi.json`, on the API and app hosts. */
const isApiAlias = (path: string) =>
  path.startsWith("/api/v1/") || path === "/api/openapi.json";

/** The public API, which routes only the canonical paths: an alias is rewritten first. */
const publicApi = (request: Request, url: URL, env: Env) => {
  if (!isApiAlias(url.pathname)) {
    return handlePublicApi(request, env);
  }
  const canonical = new URL(url);
  canonical.pathname = url.pathname.slice("/api".length);
  return handlePublicApi(new Request(canonical, request), env);
};

export const route = (
  request: Request,
  env: Env
): Promise<Response> | Response => {
  const url = new URL(request.url);
  const redirect = siteRedirect(url, env);
  if (redirect) {
    return redirect;
  }
  switch (surfaceOf(url, env)) {
    case "api": {
      return publicApi(request, url, env);
    }
    case "app": {
      if (url.pathname.startsWith("/api/auth/")) {
        return handleAuth(request, env);
      }
      if (url.pathname.startsWith("/rpc/")) {
        return handleRpc(request, env);
      }
      if (url.pathname === "/api/billing/webhook") {
        return handleBillingWebhook(request, env);
      }
      if (isApiAlias(url.pathname)) {
        return publicApi(request, url, env);
      }
      return serveStatic(request, env, "app");
    }
    default: {
      return serveStatic(request, env, "www");
    }
  }
};
