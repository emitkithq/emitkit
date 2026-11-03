import { ForbiddenError, infrastructure, NotFoundError } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import type { AccessTokenClaims, RateLimitState } from "@server/platform/auth";
import { API_KEY_RATE_LIMIT, MCP_SCOPE } from "@server/platform/auth-options";
import { makeId } from "@server/platform/ids";
import { toIso } from "@server/platform/time";
import type {
  OAuthChoices,
  OAuthConnection,
  OAuthOrganizationChoice,
} from "@shared/rpc/schemas";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** A live OAuth grant: one user's consent for one app on one project. */
export interface Grant {
  /** The consent id (`grant_…`): the MCP principal. */
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly organizationId: string;
  readonly projectId: string;
}

/** Why an access token can't be used, as its RFC 6750 challenge names it. */
export type GrantRejection =
  | { readonly _tag: "InvalidToken" }
  | { readonly _tag: "InsufficientScope" }
  | {
      readonly _tag: "RateLimited";
      readonly retryAfterSeconds: number;
      readonly rateLimit: RateLimitState;
    };

/** What a verified token may do: act for its grant, or why not. */
export type GrantVerdict =
  | {
      readonly _tag: "Granted";
      readonly grant: Grant;
      readonly rateLimit: RateLimitState;
    }
  | GrantRejection;

/** Roles that may connect an app: a grant can write events and erase users, like an API key. */
const CONNECTING_ROLES = new Set(["owner", "admin"]);

/** Better Auth stores one role, or several joined by commas. */
export const canConnect = (role: string) =>
  role.split(",").some((part) => CONNECTING_ROLES.has(part.trim()));

/** `canConnect` as an SQL condition on a member's role column, for queries that filter by it. */
export const connectingRoleSql = (column: string) =>
  `(${[...CONNECTING_ROLES]
    .map(
      (role) => `',' || replace(${column}, ' ', '') || ',' like '%,${role},%'`
    )
    .join(" or ")})`;

const RedirectUris = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeRedirectUris = Schema.decodeUnknownOption(RedirectUris);

/** The host people are sent back to: the part of a public client that can be trusted. */
const redirectHost = (redirectUris: string | null) =>
  decodeRedirectUris(redirectUris ?? "").pipe(
    (uris) => (uris._tag === "Some" ? uris.value[0] : undefined),
    (uri) => (uri && URL.canParse(uri) ? new URL(uri).hostname : null)
  );

interface ChoiceRow {
  readonly organization_id: string;
  readonly organization_name: string;
  readonly role: string;
  readonly project_id: string | null;
  readonly project_name: string | null;
}

interface ConnectionRow {
  readonly id: string;
  readonly client_id: string;
  readonly client_name: string | null;
  readonly redirect_uris: string | null;
  readonly project_id: string | null;
  readonly project_name: string | null;
  readonly project_deleted_at: string | null;
  readonly organization_name: string | null;
  readonly created_at: string;
}

/**
 * OAuth grants for the MCP server. Better Auth's OAuth provider issues the
 * tokens; this service decides what a token may do, on every request, so that
 * revoking a grant, deleting its project or demoting its user takes effect at
 * once rather than when the token expires.
 */
export class OAuthGrants extends Context.Service<
  OAuthGrants,
  {
    /**
     * The live grant behind verified token claims. The request counts
     * toward the grant's rate limit, as every request with an API key does.
     */
    readonly resolve: (
      claims: AccessTokenClaims
    ) => Effect.Effect<GrantVerdict, InfrastructureError>;
    /** What the consent screen offers: every organization, and whether it can be picked. */
    readonly choices: (
      userId: string
    ) => Effect.Effect<OAuthChoices, InfrastructureError>;
    /** Records the picked project on the session, for the consent about to be given. */
    readonly select: (
      session: { readonly sessionId: string; readonly userId: string },
      projectId: string
    ) => Effect.Effect<
      void,
      ForbiddenError | NotFoundError | InfrastructureError
    >;
    /** The signed-in user's connected apps. */
    readonly connections: (
      userId: string
    ) => Effect.Effect<readonly OAuthConnection[], InfrastructureError>;
    /** Removes a grant, its refresh tokens and its event subscriptions. */
    readonly revoke: (
      userId: string,
      grantId: string
    ) => Effect.Effect<void, NotFoundError | InfrastructureError>;
  }
>()("emitkit/oauth/OAuthGrants") {
  static readonly layer = Layer.effect(
    OAuthGrants,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /** A fixed one-minute window per grant, in Better Auth's `rateLimit` table. */
      const consume = Effect.fn("OAuthGrants.consume")(function* (
        grantId: string
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        const windowStart = nowMs - API_KEY_RATE_LIMIT.timeWindowMs;
        const [row] = yield* sql<{
          readonly count: number;
          readonly lastRequest: number;
        }>`
          insert into "rateLimit" (id, key, count, "lastRequest")
          values (${yield* makeId("rl")}, ${`mcp-grant:${grantId}`}, 1, ${nowMs})
          on conflict (key) do update set
            count = case when "lastRequest" <= ${windowStart} then 1 else count + 1 end,
            "lastRequest" = case when "lastRequest" <= ${windowStart} then ${nowMs} else "lastRequest" end
          returning count, "lastRequest"
        `.pipe(Effect.mapError(infrastructure("oauthGrants.consume")));
        const count = row?.count ?? 1;
        const resetAtMs =
          (row?.lastRequest ?? nowMs) + API_KEY_RATE_LIMIT.timeWindowMs;
        return {
          count,
          rateLimit: {
            limit: API_KEY_RATE_LIMIT.maxRequests,
            remaining: Math.max(0, API_KEY_RATE_LIMIT.maxRequests - count),
            resetAtSeconds: Math.ceil(resetAtMs / 1000),
          },
          retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
        };
      });

      const resolve = Effect.fn("OAuthGrants.resolve")(function* (
        claims: AccessTokenClaims
      ): Effect.fn.Return<GrantVerdict, InfrastructureError> {
        if (!claims.scopes.includes(MCP_SCOPE)) {
          return { _tag: "InsufficientScope" };
        }
        if (!claims.projectId) {
          return { _tag: "InvalidToken" };
        }
        const rows = yield* sql<{
          readonly id: string;
          readonly organization_id: string;
          readonly role: string;
        }>`
          select c.id, p.organization_id, m.role
          from "oauthConsent" c
          join project p on p.id = c."referenceId" and p.deleted_at is null
          join member m on m."organizationId" = p.organization_id and m."userId" = c."userId"
          where c."clientId" = ${claims.clientId} and c."userId" = ${claims.userId}
            and c."referenceId" = ${claims.projectId}
          limit 1
        `.pipe(Effect.mapError(infrastructure("oauthGrants.resolve")));
        const [row] = rows;
        if (!row || !canConnect(row.role)) {
          return { _tag: "InvalidToken" };
        }
        const grant = {
          clientId: claims.clientId,
          id: row.id,
          organizationId: row.organization_id,
          projectId: claims.projectId,
          userId: claims.userId,
        };
        const usage = yield* consume(row.id);
        if (usage.count > API_KEY_RATE_LIMIT.maxRequests) {
          return {
            _tag: "RateLimited",
            rateLimit: usage.rateLimit,
            retryAfterSeconds: usage.retryAfterSeconds,
          };
        }
        return { _tag: "Granted", grant, rateLimit: usage.rateLimit };
      });

      const choices = Effect.fn("OAuthGrants.choices")(function* (
        userId: string
      ) {
        const rows = yield* sql<ChoiceRow>`
          select o.id as organization_id, o.name as organization_name, m.role,
            p.id as project_id, p.name as project_name
          from member m
          join organization o on o.id = m."organizationId"
          left join project p on p.organization_id = o.id and p.deleted_at is null
          where m."userId" = ${userId}
          order by o.name collate nocase, p.created_at
        `.pipe(Effect.mapError(infrastructure("oauthGrants.choices")));
        const organizations = new Map<string, OAuthOrganizationChoice>();
        for (const row of rows) {
          const current = organizations.get(row.organization_id) ?? {
            canConnect: canConnect(row.role),
            id: row.organization_id,
            name: row.organization_name,
            projects: [],
          };
          organizations.set(row.organization_id, {
            ...current,
            projects:
              row.project_id && row.project_name
                ? [
                    ...current.projects,
                    { id: row.project_id, name: row.project_name },
                  ]
                : current.projects,
          });
        }
        return { organizations: [...organizations.values()] };
      });

      const select = Effect.fn("OAuthGrants.select")(function* (
        session: { readonly sessionId: string; readonly userId: string },
        projectId: string
      ) {
        const [row] = yield* sql<{ readonly role: string }>`
          select m.role from project p
          join member m on m."organizationId" = p.organization_id and m."userId" = ${session.userId}
          where p.id = ${projectId} and p.deleted_at is null
        `.pipe(Effect.mapError(infrastructure("oauthGrants.select")));
        if (!row) {
          return yield* new NotFoundError({ entity: "project", id: projectId });
        }
        if (!canConnect(row.role)) {
          return yield* new ForbiddenError({
            message: "Only owners and admins can connect apps",
          });
        }
        yield* sql`
          update session set "oauthProjectId" = ${projectId}
          where id = ${session.sessionId} and "userId" = ${session.userId}
        `.pipe(Effect.mapError(infrastructure("oauthGrants.select")));
      });

      const connections = Effect.fn("OAuthGrants.connections")(function* (
        userId: string
      ) {
        const rows = yield* sql<ConnectionRow>`
          select c.id, c."clientId" as client_id, cl.name as client_name,
            cl."redirectUris" as redirect_uris, p.id as project_id,
            p.name as project_name, p.deleted_at as project_deleted_at,
            o.name as organization_name, c."createdAt" as created_at
          from "oauthConsent" c
          join "oauthClient" cl on cl."clientId" = c."clientId"
          left join project p on p.id = c."referenceId"
          left join organization o on o.id = p.organization_id
          where c."userId" = ${userId}
          order by c."createdAt" desc
        `.pipe(Effect.mapError(infrastructure("oauthGrants.connections")));
        return rows.map((row): OAuthConnection => ({
          clientName: row.client_name ?? "Unnamed app",
          connectedAt: String(row.created_at),
          id: row.id,
          organizationName: row.organization_name,
          projectName:
            row.project_name && row.project_deleted_at === null
              ? row.project_name
              : null,
          redirectHost: redirectHost(row.redirect_uris),
        }));
      });

      const revoke = Effect.fn("OAuthGrants.revoke")(function* (
        userId: string,
        grantId: string
      ) {
        const [grant] = yield* sql<{
          readonly clientId: string;
          readonly referenceId: string | null;
        }>`
          delete from "oauthConsent" where id = ${grantId} and "userId" = ${userId}
          returning "clientId", "referenceId"
        `.pipe(Effect.mapError(infrastructure("oauthGrants.revoke")));
        if (!grant) {
          return yield* new NotFoundError({
            entity: "connection",
            id: grantId,
          });
        }
        const now = toIso(yield* Clock.currentTimeMillis);
        yield* sql`
          update "oauthRefreshToken" set revoked = ${now}
          where "clientId" = ${grant.clientId} and "userId" = ${userId}
            and "referenceId" is ${grant.referenceId} and revoked is null
        `.pipe(Effect.mapError(infrastructure("oauthGrants.revokeTokens")));
        yield* sql`delete from mcp_subscription where principal_id = ${grantId}`.pipe(
          Effect.mapError(infrastructure("oauthGrants.revokeSubscriptions"))
        );
      });

      return OAuthGrants.of({ choices, connections, resolve, revoke, select });
    })
  );
}
