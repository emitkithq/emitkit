import { Billing } from "@server/billing/billing";
import { ForbiddenError, infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Notifications } from "@server/notifications/notifications";
import { Memberships } from "@server/organizations/memberships";
import { makeAuthOptions } from "@server/platform/auth-options";
import type { AuthOrganization, AuthUser } from "@server/platform/auth-options";
import { CloudflareEnv } from "@server/platform/cloudflare";
import { AppConfig } from "@server/platform/config";
import { Mailer } from "@server/platform/mailer";
import {
  sessionHintDomain,
  withSessionHint,
} from "@server/platform/session-hint";
import { Telemetry } from "@server/platform/telemetry";
import { Projects } from "@server/projects/projects";
import type { SignupMethod } from "@server/telemetry/events";
import { scopesFrom } from "@shared/scopes";
import type { Scope } from "@shared/scopes";
import { betterAuth } from "better-auth";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { D1Dialect } from "kysely-d1";

export interface SessionInfo {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly activeOrganizationId: string | null;
}

export interface IssuedApiKey {
  readonly id: string;
  readonly secret: string;
}

export interface VerifiedApiKey {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  /** What the key may do; a key issued without scopes has all of them. */
  readonly scopes: readonly Scope[];
  readonly rateLimit: RateLimitState;
}

export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtSeconds: number;
}

export type ApiKeyRejection =
  | { readonly _tag: "Invalid" }
  | {
      readonly _tag: "RateLimited";
      readonly retryAfterSeconds: number;
      readonly rateLimit: RateLimitState;
    };

/** Read loosely: `scopesFrom` narrows the scopes, so a bad value can't widen a key. */
const KeyMetadata = Schema.Struct({
  projectId: Schema.optional(Schema.String),
  scopes: Schema.optional(Schema.Unknown),
});
const decodeMetadata = Schema.decodeUnknownOption(
  Schema.Union([KeyMetadata, Schema.fromJsonString(KeyMetadata)])
);

const VerifiedKeyRecord = Schema.Struct({
  id: Schema.String,
  lastRequest: Schema.optional(
    Schema.NullOr(Schema.Union([Schema.Date, Schema.String, Schema.Number]))
  ),
  metadata: Schema.optional(Schema.NullOr(Schema.Unknown)),
  rateLimitMax: Schema.optional(Schema.NullOr(Schema.Number)),
  rateLimitTimeWindow: Schema.optional(Schema.NullOr(Schema.Number)),
  referenceId: Schema.String,
  requestCount: Schema.optional(Schema.NullOr(Schema.Number)),
});

const VerifyResponse = Schema.Struct({
  error: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        code: Schema.optional(Schema.NullOr(Schema.String)),
        details: Schema.optional(
          Schema.NullOr(
            Schema.Struct({ tryAgainIn: Schema.optional(Schema.Number) })
          )
        ),
      })
    )
  ),
  key: Schema.optional(Schema.NullOr(VerifiedKeyRecord)),
  valid: Schema.Boolean,
});

const toEpochMs = (
  value: string | number | Date | null | undefined,
  fallback: number
) => {
  const parsed =
    value === null || value === undefined
      ? Number.NaN
      : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type ApiKeyVerdict =
  | { readonly _tag: "Valid"; readonly key: VerifiedApiKey }
  | ApiKeyRejection;

const SIGNUP_VIA = {
  dev: "local dev sign-in",
  email_otp: "an emailed code",
  other: "another method",
  password: "email and password",
} satisfies Record<SignupMethod, string>;

const actor = (user: AuthUser, headers: Headers | null = null) => ({
  email: user.email,
  headers,
  userId: user.id,
});

/** The organization an event is about, as telemetry names it. */
const scoped = (organization: AuthOrganization) => ({
  organizationId: organization.id,
  organizationName: organization.name,
});

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Better Auth, built once per isolate over the D1 binding. Everything the
 * rest of the backend needs from it is exposed as Effects.
 */
export class Auth extends Context.Service<
  Auth,
  {
    readonly handle: (
      request: Request
    ) => Effect.Effect<Response, InfrastructureError>;
    readonly session: (
      headers: Headers
    ) => Effect.Effect<SessionInfo | null, InfrastructureError>;
    readonly createOrganization: (
      headers: Headers,
      input: { readonly name: string; readonly slug: string }
    ) => Effect.Effect<
      { readonly id: string; readonly slug: string },
      InfrastructureError
    >;
    readonly issueApiKey: (input: {
      readonly organizationId: string;
      readonly userId: string;
      readonly name: string;
      readonly projectId: string;
      readonly scopes: readonly Scope[];
    }) => Effect.Effect<IssuedApiKey, InfrastructureError | ForbiddenError>;
    readonly verifyApiKey: (
      key: string
    ) => Effect.Effect<ApiKeyVerdict, InfrastructureError>;
  }
>()("emitkit/platform/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const config = yield* AppConfig;
      const mailer = yield* Mailer;
      const memberships = yield* Memberships;
      const projects = yield* Projects;
      const billing = yield* Billing;
      const notifications = yield* Notifications;
      const telemetry = yield* Telemetry;
      const context = yield* Effect.context<never>();
      const run = Effect.runPromiseWith(context);

      const auth = betterAuth(
        makeAuthOptions(
          {
            allowSignup: config.allowSignup,
            appUrl: config.appUrl,
            // `import.meta.env.DEV` is `false` in every build, so production
            // bundles never enable it; the host check guards odd dev setups.
            devSignIn:
              import.meta.env.DEV &&
              new URL(config.appUrl).hostname.endsWith("localhost"),
            siteUrl: config.siteUrl,
          },
          {
            firstOrganizationId: (userId) =>
              run(memberships.firstOrganizationId(userId).pipe(Effect.orDie)),
            onUserCreated: (user, method, headers) =>
              run(
                Effect.andThen(
                  telemetry.identify({
                    ...actor(user, headers),
                    name: user.name,
                  }),
                  telemetry.track(
                    "new_signup",
                    {
                      description: `${user.name || user.email} (${user.email}) signed up with ${SIGNUP_VIA[method]}.`,
                      method,
                      name: user.name,
                    },
                    actor(user, headers)
                  )
                )
              ),
            onUserDeleted: (user) =>
              run(
                telemetry.track(
                  "account_deleted",
                  {
                    description: `${user.name || user.email} (${user.email}) deleted their account.`,
                    name: user.name,
                  },
                  actor(user)
                )
              ),
            onOrganizationCreated: (organization, creator) =>
              run(
                projects
                  .ensureDefault(organization.id)
                  .pipe(
                    Effect.asVoid,
                    Effect.orDie,
                    Effect.andThen(billing.registerCustomer(organization.id)),
                    Effect.andThen(
                      telemetry.track(
                        "organization_created",
                        scoped(organization),
                        actor(creator)
                      )
                    )
                  )
              ),
            onOrganizationDeleted: (organization, deletedBy) =>
              run(
                memberships.forgetOrganization(organization.id).pipe(
                  Effect.andThen(billing.release(organization.id)),
                  Effect.orDie,
                  Effect.andThen(
                    telemetry.track(
                      "organization_deleted",
                      {
                        ...scoped(organization),
                        description: `${deletedBy.email} deleted ${organization.name}.`,
                      },
                      actor(deletedBy)
                    )
                  )
                )
              ),
            onInvitationCreated: (organization, inviter, role) =>
              run(
                telemetry.track(
                  "member_invited",
                  { ...scoped(organization), role },
                  actor(inviter)
                )
              ),
            onInvitationAccepted: (organization, user) =>
              run(
                telemetry.track(
                  "member_joined",
                  scoped(organization),
                  actor(user)
                )
              ),
            // Best effort: joining shouldn't fail over push preferences.
            onMemberJoined: (organizationId, userId) =>
              run(
                notifications.extendToOrganization(organizationId, userId).pipe(
                  Effect.catchTag("InfrastructureError", (failure) =>
                    Effect.logWarning("extending push devices failed", {
                      operation: failure.operation,
                    })
                  )
                )
              ),
            beforeInvite: (organizationId, email) =>
              run(
                billing.inviteBlocked(organizationId, email).pipe(Effect.orDie)
              ),
            beforeUserDeleted: (user) =>
              run(
                memberships.releaseUser(user.id).pipe(
                  // Organizations owned alone go with the account: churn too.
                  Effect.tap((deleted) =>
                    Effect.forEach(
                      deleted,
                      (organization) =>
                        telemetry.track(
                          "organization_deleted",
                          {
                            ...scoped(organization),
                            description: `${user.email} deleted ${organization.name} with their account.`,
                          },
                          actor(user)
                        ),
                      { discard: true }
                    )
                  ),
                  Effect.as(null),
                  Effect.catchTag("ConflictError", (conflict) =>
                    Effect.succeed(conflict.message)
                  ),
                  Effect.orDie
                )
              ),
            sendEmail: (email) => run(mailer.send(email).pipe(Effect.orDie)),
          },
          {
            // An explicit dialect skips Better Auth's runtime driver probing.
            database: {
              dialect: new D1Dialect({ database: env.DB }),
              transaction: false,
              type: "sqlite",
            },
            secret: Redacted.value(config.authSecret),
          }
        )
      );
      // betterAuth() starts its async init immediately. Finish it while the
      // layer is built so it never outlives the request that started it:
      // workerd drops a request's pending I/O once its response is sent, and
      // under `vite dev` Better Auth's lazy adapter `import()` is such I/O.
      const authContext = yield* Effect.tryPromise({
        catch: infrastructure("auth.init"),
        try: () => auth.$context,
      });
      const sessionHint = {
        domain: sessionHintDomain(config.appUrl, config.siteUrl),
        secure: config.appUrl.startsWith("https://"),
        sessionCookie: authContext.authCookies.sessionToken.name,
      };

      const handle = Effect.fn("Auth.handle")(function* (request: Request) {
        const response = yield* Effect.tryPromise({
          catch: infrastructure("auth.handle"),
          try: () => auth.handler(request),
        });
        return yield* Effect.tryPromise({
          catch: infrastructure("auth.sessionHint"),
          try: () => withSessionHint(request, response, sessionHint),
        });
      });

      const session = Effect.fn("Auth.session")(function* (headers: Headers) {
        const result = yield* Effect.tryPromise({
          catch: infrastructure("auth.session"),
          try: () => auth.api.getSession({ headers }),
        });
        if (!result) {
          return null;
        }
        return {
          activeOrganizationId: result.session.activeOrganizationId ?? null,
          email: result.user.email,
          name: result.user.name,
          userId: result.user.id,
        };
      });

      const createOrganization = Effect.fn("Auth.createOrganization")(
        function* (
          headers: Headers,
          input: { readonly name: string; readonly slug: string }
        ) {
          const organization = yield* Effect.tryPromise({
            catch: infrastructure("auth.createOrganization"),
            try: () =>
              auth.api.createOrganization({
                body: { name: input.name, slug: input.slug },
                headers,
              }),
          });
          if (!organization) {
            return yield* infrastructure("auth.createOrganization")(
              "organization was not created"
            );
          }
          return { id: organization.id, slug: organization.slug };
        }
      );

      const issueApiKey = Effect.fn("Auth.issueApiKey")(function* (input: {
        readonly organizationId: string;
        readonly userId: string;
        readonly name: string;
        readonly projectId: string;
        readonly scopes: readonly Scope[];
      }) {
        const created = yield* Effect.tryPromise({
          catch: (cause) =>
            String(cause).includes("FORBIDDEN") ||
            String(cause).includes("permission")
              ? new ForbiddenError({
                  message: "Only owners and admins can manage API keys",
                })
              : infrastructure("auth.createApiKey")(cause),
          try: () =>
            auth.api.createApiKey({
              body: {
                metadata: {
                  projectId: input.projectId,
                  scopes: [...input.scopes],
                },
                name: input.name,
                organizationId: input.organizationId,
                userId: input.userId,
              },
            }),
        });
        return { id: created.id, secret: created.key };
      });

      const verifyApiKey = Effect.fn("Auth.verifyApiKey")(function* (
        key: string
      ) {
        const raw = yield* Effect.tryPromise({
          catch: infrastructure("auth.verifyApiKey"),
          try: () => auth.api.verifyApiKey({ body: { key } }),
        });
        const result = yield* Schema.decodeUnknownEffect(VerifyResponse)(
          raw
        ).pipe(Effect.mapError(infrastructure("auth.verifyApiKey.decode")));
        const nowMs = yield* Effect.clockWith(
          (clock) => clock.currentTimeMillis
        );
        if (result.error?.code === "RATE_LIMITED") {
          const retryAfterMs =
            result.error.details?.tryAgainIn ?? DEFAULT_WINDOW_MS;
          return {
            _tag: "RateLimited",
            rateLimit: {
              limit: DEFAULT_LIMIT,
              remaining: 0,
              resetAtSeconds: Math.ceil((nowMs + retryAfterMs) / 1000),
            },
            retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
          } satisfies ApiKeyVerdict;
        }
        const verified = result.key;
        if (!result.valid || !verified) {
          return { _tag: "Invalid" } satisfies ApiKeyVerdict;
        }
        const limit = verified.rateLimitMax ?? DEFAULT_LIMIT;
        const windowMs = verified.rateLimitTimeWindow ?? DEFAULT_WINDOW_MS;
        const metadata = decodeMetadata(verified.metadata);
        // No metadata: a key from before projects. Unreadable: no scopes.
        const settings =
          metadata._tag === "Some"
            ? metadata.value
            : {
                scopes:
                  verified.metadata === null || verified.metadata === undefined
                    ? undefined
                    : null,
              };
        return {
          _tag: "Valid",
          key: {
            id: verified.id,
            organizationId: verified.referenceId,
            projectId: settings.projectId ?? null,
            scopes: scopesFrom(settings.scopes),
            rateLimit: {
              limit,
              remaining: Math.max(0, limit - (verified.requestCount ?? 0)),
              resetAtSeconds: Math.ceil(
                (toEpochMs(verified.lastRequest, nowMs) + windowMs) / 1000
              ),
            },
          },
        } satisfies ApiKeyVerdict;
      });

      return Auth.of({
        createOrganization,
        handle,
        issueApiKey,
        session,
        verifyApiKey,
      });
    })
  );
}
