import { Option, Schema } from "effect";

/**
 * The signed-in hint: a cookie that says only "this browser has a session",
 * readable by the marketing site so its header can offer Dashboard instead of
 * Sign in from the first paint (the inline script in `web/www/index.html`
 * reads it by this name). The session cookie itself stays HttpOnly and
 * host-only on the app host; the hint carries no secret.
 *
 * It follows the session cookie: set with the same lifetime whenever Better
 * Auth sets it, cleared whenever Better Auth clears it. `get-session` repairs
 * drift in both directions: it adds a missing hint (sessions that began
 * before the hint existed) and clears one whose session is gone (expired, or
 * revoked from another device).
 */
export const SESSION_HINT_COOKIE = "emitkit_signed_in";

export interface SessionHintSettings {
  /** Better Auth's session cookie name (`[__Secure-]emitkit.session_token`). */
  readonly sessionCookie: string;
  /** The site's host, when the app host is a subdomain of it; else no hint. */
  readonly domain: string | null;
  readonly secure: boolean;
}

/**
 * The hint must be readable on the site host, so it is scoped to the site's
 * domain. That only works when the app host is a subdomain of the site host
 * (`app.emitkit.com` under `emitkit.com`); any other layout, or no site at
 * all, gets no hint.
 */
export const sessionHintDomain = (
  appUrl: string,
  siteUrl: string | null
): string | null => {
  if (!siteUrl) {
    return null;
  }
  const app = new URL(appUrl).hostname;
  const site = new URL(siteUrl).hostname;
  return app.endsWith(`.${site}`) ? site : null;
};

/**
 * The hint's `Set-Cookie`. `lifetime` is the session cookie's `Max-Age=…` or
 * `Expires=…` (`null`: a browser-session cookie); `"clear"` deletes the hint.
 */
const hint = (
  settings: SessionHintSettings,
  lifetime: string | null | "clear"
) =>
  [
    `${SESSION_HINT_COOKIE}=${lifetime === "clear" ? "" : "1"}`,
    `Domain=${settings.domain}`,
    "Path=/",
    "SameSite=Lax",
    ...(settings.secure ? ["Secure"] : []),
    ...(lifetime === "clear" ? ["Max-Age=0"] : []),
    ...(lifetime !== "clear" && lifetime !== null ? [lifetime] : []),
  ].join("; ");

const attributeOf = (cookie: string, name: string) =>
  cookie
    .split(";")
    .slice(1)
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${name.toLowerCase()}=`));

/** Whether a `Set-Cookie` value deletes its cookie rather than setting it. */
const clears = (cookie: string) => {
  const value = cookie.slice(cookie.indexOf("=") + 1).split(";")[0] ?? "";
  const maxAge = attributeOf(cookie, "Max-Age")?.split("=")[1];
  const expires = attributeOf(cookie, "Expires")?.slice("Expires=".length);
  return (
    value.trim() === "" ||
    (maxAge !== undefined && Number(maxAge) <= 0) ||
    (expires !== undefined && Date.parse(expires) <= Date.now())
  );
};

const hasCookie = (request: Request, name: string) =>
  (request.headers.get("cookie") ?? "")
    .split(";")
    .some((part) => part.trim().startsWith(`${name}=`));

const decodeSessionBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.NullOr(
      Schema.Struct({ session: Schema.Struct({ expiresAt: Schema.String }) })
    )
  )
);

/**
 * What `get-session` answered: the session's expiry, `null` for no session,
 * or `undefined` when the body can't be read.
 */
const sessionExpiry = async (response: Response) => {
  const body = decodeSessionBody(await response.clone().text());
  if (Option.isNone(body)) {
    return;
  }
  if (body.value === null) {
    return null;
  }
  const expiresAt = new Date(body.value.session.expiresAt);
  return Number.isNaN(expiresAt.getTime()) ? undefined : expiresAt;
};

/** The hint `Set-Cookie` this auth response needs, if any. */
const hintFor = async (
  request: Request,
  response: Response,
  settings: SessionHintSettings
) => {
  const sessionCookie = response.headers
    .getSetCookie()
    .findLast((cookie) => cookie.startsWith(`${settings.sessionCookie}=`));
  if (sessionCookie) {
    if (clears(sessionCookie)) {
      return hint(settings, "clear");
    }
    const lifetime =
      attributeOf(sessionCookie, "Max-Age") ??
      attributeOf(sessionCookie, "Expires") ??
      null;
    return hint(settings, lifetime);
  }
  if (!response.ok || !new URL(request.url).pathname.endsWith("/get-session")) {
    return null;
  }
  const hinted = hasCookie(request, SESSION_HINT_COOKIE);
  const expiry = await sessionExpiry(response);
  if (expiry === null) {
    return hinted ? hint(settings, "clear") : null;
  }
  if (expiry === undefined || hinted) {
    return null;
  }
  return hint(settings, `Expires=${expiry.toUTCString()}`);
};

/** Adds the hint cookie to a Better Auth response, when it needs one. */
export const withSessionHint = async (
  request: Request,
  response: Response,
  settings: SessionHintSettings
): Promise<Response> => {
  if (!settings.domain) {
    return response;
  }
  const cookie = await hintFor(request, response, settings);
  if (!cookie) {
    return response;
  }
  // Redirects from `Response.redirect()` have immutable headers: copy them.
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
