/**
 * The browser half of the OAuth provider's flow (`@better-auth/oauth-provider`).
 *
 * The provider sends people to `/auth/sign-in` and `/oauth/consent` with a
 * signed copy of the authorization request in the query. Requests that move
 * the flow on must echo that signed query as `oauth_query`.
 */

import { PROJECT_PICKED_HEADER } from "@shared/oauth";

const SIGNED_NAMES_PARAM = "ba_param";
/** Present once the provider has cleared the project pick for this session. */
const POST_LOGIN_CLEARED_PARAM = "ba_pl";
const REMEMBERED_KEY = "emitkit:oauth-query";

/**
 * The signed part of a query string, or undefined when it carries no
 * signature. Mirrors the provider client's own `buildSignedOAuthQuery`, which
 * isn't exported.
 */
export const signedOAuthQuery = (search: string): string | undefined => {
  const params = new URLSearchParams(search);
  const names = new Set(params.getAll(SIGNED_NAMES_PARAM));
  if (!params.has("sig") || names.size === 0) {
    return undefined;
  }
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === SIGNED_NAMES_PARAM || names.has(key)) {
      signed.append(key, value);
    }
  }
  return signed.toString();
};

const isExpired = (query: string) => {
  const exp = Number(new URLSearchParams(query).get("exp"));
  return Number.isFinite(exp) && exp > 0 && exp * 1000 < Date.now();
};

/**
 * Keeps the signed query of an auth page for the rest of the tab's visit.
 * Better Auth UI's links (sign in ↔ sign up) drop the query string, and the
 * provider's own client plugin only reads the current URL, so someone who
 * signs up from the sign-in page would otherwise leave the flow.
 */
export const rememberOAuthQuery = (search: string) => {
  const signed = signedOAuthQuery(search);
  if (signed) {
    sessionStorage.setItem(REMEMBERED_KEY, signed);
  }
};

export const forgetOAuthQuery = () => sessionStorage.removeItem(REMEMBERED_KEY);

export const rememberedOAuthQuery = (): string | undefined => {
  const query = sessionStorage.getItem(REMEMBERED_KEY) ?? undefined;
  if (query && isExpired(query)) {
    forgetOAuthQuery();
    return undefined;
  }
  return query;
};

/** Better Auth endpoints that sign someone in and should resume the flow. */
const SIGN_IN_PATHS = ["/sign-in/", "/sign-up/", "/magic-link", "/dev/sign-in"];

/**
 * A Better Auth fetch plugin that adds the remembered signed query to sign-in
 * and sign-up requests made from an auth page without one in its URL.
 */
export const rememberedOAuthQueryPlugin = {
  hooks: {
    onRequest(context: { body?: unknown; method?: string; url: URL | string }) {
      const url = String(context.url);
      if (
        context.method === "GET" ||
        !SIGN_IN_PATHS.some((path) => url.includes(path)) ||
        signedOAuthQuery(window.location.search)
      ) {
        return;
      }
      const query = rememberedOAuthQuery();
      const body: unknown =
        typeof context.body === "string"
          ? JSON.parse(context.body || "{}")
          : (context.body ?? {});
      if (!query || typeof body !== "object" || body === null) {
        return;
      }
      if ("oauth_query" in body) {
        return;
      }
      context.body = JSON.stringify({ ...body, oauth_query: query });
    },
  },
  id: "emitkit-remembered-oauth-query",
  name: "Remembered OAuth query",
};

export type ConsentStage = "post_login" | "consent";

/** The provider sends people here twice: to pick a project, then to consent. */
export const consentStage = (search: string): ConsentStage =>
  new URLSearchParams(search).has(POST_LOGIN_CLEARED_PARAM)
    ? "consent"
    : "post_login";

export interface PublicClient {
  readonly name: string;
}

interface RedirectResult {
  readonly url?: string;
  readonly redirect_uri?: string;
  readonly message?: string;
}

/**
 * POSTs to an OAuth endpoint with plain `fetch`: the auth client would follow
 * `{ redirect, url }` on its own, and the consent screen needs to decide
 * where to go.
 */
const post = async (
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) => {
  const response = await fetch(`/api/auth${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
  const result = (await response.json().catch(() => ({}))) as RedirectResult;
  const target = result.url ?? result.redirect_uri;
  if (!response.ok || !target) {
    throw new Error(result.message ?? "The authorization couldn't continue.");
  }
  return new URL(target, window.location.origin);
};

const isConsentPage = (url: URL) =>
  url.origin === window.location.origin && url.pathname === "/oauth/consent";

/**
 * Approves the request on the page's signed query and returns where the
 * browser goes next: back to the app with a code, or to its error. On the
 * project-pick stage the provider answers with the consent page itself; the
 * person already approved on this screen, so consent is given right away.
 */
export const approve = async (search: string): Promise<URL> => {
  const oauthQuery = signedOAuthQuery(search);
  if (consentStage(search) === "consent") {
    return await post("/oauth2/consent", {
      accept: true,
      oauth_query: oauthQuery,
    });
  }
  const next = await post(
    "/oauth2/continue",
    { oauth_query: oauthQuery, postLogin: true },
    { [PROJECT_PICKED_HEADER]: "1" }
  );
  if (!isConsentPage(next)) {
    return next;
  }
  return await post("/oauth2/consent", {
    accept: true,
    oauth_query: signedOAuthQuery(next.search),
  });
};

/** Refuses the request: the app gets `error=access_denied`. */
export const deny = async (search: string): Promise<URL> =>
  await post("/oauth2/consent", {
    accept: false,
    oauth_query: signedOAuthQuery(search),
  });

export const fetchPublicClient = async (
  clientId: string
): Promise<PublicClient> => {
  const response = await fetch(
    `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error("This app isn't registered with EmitKit.");
  }
  const client = (await response.json()) as { client_name?: string };
  return { name: client.client_name?.trim() || "An unnamed app" };
};
