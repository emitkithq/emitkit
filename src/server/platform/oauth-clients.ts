import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { Option, Schema } from "effect";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isHttpLoopback = (uri: string) =>
  URL.canParse(uri) &&
  new URL(uri).protocol === "http:" &&
  LOOPBACK_HOSTS.has(new URL(uri).hostname);

/** A request that names a resource (RFC 8707). */
const WithResource = Schema.Struct({
  resource: Schema.Union([
    Schema.NonEmptyString,
    Schema.NonEmptyArray(Schema.String),
  ]),
});
const namesResource = Schema.is(WithResource);

/** Token grants that issue a user's access token. */
const UserGrant = Schema.Struct({
  grant_type: Schema.Literals(["authorization_code", "refresh_token"]),
});
const decodeTokenBody = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Unknown)
);
const isUserGrant = Schema.is(UserGrant);

/**
 * Clients that don't send `resource` would get an opaque token that `/mcp`
 * can't verify, and loop through sign-in. The MCP endpoint is the only
 * resource, so it is the default (RFC 8707 §2 lets the server pick one).
 */
export const defaultResource = (resource: string) =>
  ({
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(
            async (ctx) =>
              await Promise.resolve(
                namesResource(ctx.query)
                  ? undefined
                  : { context: { query: { ...ctx.query, resource } } }
              )
          ),
          matcher: (ctx) => ctx.path === "/oauth2/authorize",
        },
        {
          handler: createAuthMiddleware(async (ctx) => {
            // The body, every field kept, when it's a user grant.
            const grant = decodeTokenBody(ctx.body).pipe(
              Option.filter(isUserGrant),
              Option.getOrUndefined
            );
            return await Promise.resolve(
              grant && !namesResource(ctx.body)
                ? { context: { body: { ...grant, resource } } }
                : undefined
            );
          }),
          matcher: (ctx) => ctx.path === "/oauth2/token",
        },
      ],
    },
    id: "default-mcp-resource",
  }) satisfies BetterAuthPlugin;

/** A registration request that leaves `application_type` to the server. */
const UntypedRegistration = Schema.Struct({
  application_type: Schema.optional(Schema.Undefined),
  redirect_uris: Schema.NonEmptyArray(Schema.String),
});
const decodeUntypedRegistration =
  Schema.decodeUnknownOption(UntypedRegistration);

/**
 * Dynamic client registration for CLI and desktop MCP clients. Claude Code,
 * Cursor and the MCP SDKs register an `http://localhost:<port>/callback`
 * redirect without `application_type`, which the OAuth provider reads as
 * `web` and refuses (web clients need https). A client whose redirects are
 * all http loopback URIs is a native app (RFC 8252 §7.3), so say so.
 */
export const nativeLoopbackClients = () =>
  ({
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (ctx) => {
            const registration = decodeUntypedRegistration(ctx.body);
            if (
              Option.isNone(registration) ||
              !registration.value.redirect_uris.every(isHttpLoopback)
            ) {
              return;
            }
            return await Promise.resolve({
              context: { body: { ...ctx.body, application_type: "native" } },
            });
          }),
          matcher: (ctx) => ctx.path === "/oauth2/register",
        },
      ],
    },
    id: "native-loopback-clients",
  }) satisfies BetterAuthPlugin;
