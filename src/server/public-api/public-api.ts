import { answerJson } from "@server/cards/cards";
import type { Card } from "@server/cards/cards";
import { Channels } from "@server/channels/channels";
import {
  describeFailure,
  ForbiddenError,
  InfrastructureError,
  infrastructure,
} from "@server/errors";
import { Events } from "@server/events/events";
import type { FoundEvent } from "@server/events/events";
import { Idempotency } from "@server/idempotency/idempotency";
import { Identities } from "@server/identities/identities";
import { Memberships } from "@server/organizations/memberships";
import { Auth } from "@server/platform/auth";
import type { RateLimitState } from "@server/platform/auth";
import { AppConfig } from "@server/platform/config";
import { sha256Hex } from "@server/platform/ids";
import { stringifyJson } from "@server/platform/json";
import { toIso } from "@server/platform/time";
import { Projects } from "@server/projects/projects";
import { rateLimitHeaders, RequestId } from "@server/public-api/http";
import {
  CreateEventBody,
  EventIdParams,
  IdentifyBody,
  ListEventsQuery,
  UserIdParams,
} from "@server/public-api/schemas";
import type { ListEventsArgs } from "@server/public-api/schemas";
import { slugify } from "@server/slug";
import { Milestones } from "@server/telemetry/milestones";
import { excessKeyMessage, STRICT_PARSE } from "@shared/actions";
import type { Scope } from "@shared/scopes";
import {
  Context,
  Effect,
  Layer,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
} from "effect";

/** Idempotency fingerprints use the canonical path, so `/api/v1` and MCP replays match `/v1`. */
const EVENTS_PATH = "/v1/events";

/**
 * Who is calling: resolved once from the credential (an API key), then
 * read by every operation. Scopes say what it may do; the project is where
 * its events go.
 */
export interface Principal {
  readonly organizationId: string;
  /** Null for keys issued before keys had a project: event operations refuse them. */
  readonly projectId: string | null;
  readonly scopes: readonly Scope[];
  readonly rateLimit: RateLimitState;
  readonly via: "api_key";
  /** The credential's id: idempotency keys are kept per credential. */
  readonly credentialId: string;
}

/** One call of an operation, from a REST request or an MCP tool call. */
export interface Call {
  /** The API key sent (`credential`); null when missing or ambiguous. */
  readonly credential: string | null;
  /** Already authenticated (MCP resolves it once per request); skips the credential. */
  readonly principal?: Principal;
  /** The JSON body as sent; the idempotency fingerprint covers it byte for byte. */
  readonly body?: string;
  /** `Idempotency-Key`, trimmed; undefined when not sent. */
  readonly idempotencyKey?: string | undefined;
  /** Path parameters over REST, the tool arguments over MCP. */
  readonly params?: unknown;
}

/** A call whose credential was verified. */
interface Caller extends Call {
  readonly principal: Principal;
}

/** A call's response: REST sends all of it, MCP the status and body. */
export interface Reply {
  readonly status: number;
  readonly body: Schema.JsonObject;
  readonly headers: Readonly<Record<string, string>>;
}

/** Answers one call of an operation. */
export type Invoke = (call: Call) => Effect.Effect<Reply, never, RequestId>;

/** An operation's result: the status and the envelope's `data`. */
interface Success {
  readonly status: number;
  readonly data: Schema.Json;
  /** Sets `X-Idempotent-Replay: true`. */
  readonly replayed?: boolean;
}

/**
 * The status and body of a failure. `code` is stable for programs to switch
 * on; `error` and `message` are for people. Without a `message` here, the
 * error's own message is sent (it says what state blocked the call).
 */
interface ErrorReply {
  readonly status: number;
  readonly code: string;
  readonly error: string;
  readonly message?: string;
}

interface Tagged {
  readonly _tag: string;
}

/** The request doesn't match the contract: 400 `Validation error` with `details`. */
class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  { details: Schema.Array(Schema.Json) }
) {}

/** Failures every operation answers the same way. */
const SHARED_ERRORS = {
  ConflictError: {
    code: "idempotency_conflict",
    error: "Idempotency conflict",
    message: "This idempotency key was already used with a different request",
    status: 409,
  },
  ForbiddenError: {
    code: "forbidden",
    error: "Forbidden",
    message: "Insufficient permission for this operation",
    status: 403,
  },
} satisfies Record<string, ErrorReply>;
type SharedTag = keyof typeof SHARED_ERRORS | InvalidRequest["_tag"];

/**
 * A public API operation, shared by REST and MCP: decodes its input (the
 * JSON body, or path parameters / tool arguments), runs for a verified
 * caller, and maps each error it can fail with to a contract status and
 * body.
 */
interface Operation<I> {
  /** What the credential must be allowed to do; null for any credential. */
  readonly scope: Scope | null;
  readonly input: (call: Call) => Effect.Effect<I, InvalidRequest>;
  readonly run: (caller: Caller, input: I) => Effect.Effect<Success, Tagged>;
  readonly errors: Readonly<Record<string, ErrorReply>>;
}

/** Checks that `errors` covers every failure of `run` not in `SHARED_ERRORS`. */
const operation = <I, E extends Tagged>(spec: {
  readonly scope: Scope | null;
  readonly input: (call: Call) => Effect.Effect<I, InvalidRequest>;
  readonly run: (caller: Caller, input: I) => Effect.Effect<Success, E>;
  /** Every other failure of `run`; a shared one (409, 403) may be answered differently. */
  readonly errors: Readonly<Record<Exclude<E["_tag"], SharedTag>, ErrorReply>> &
    Partial<Readonly<Record<SharedTag, ErrorReply>>>;
}): Operation<I> => ({ ...spec, errors: { ...SHARED_ERRORS, ...spec.errors } });

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();
const isPropertyKeySegment = Schema.is(
  Schema.Struct({ key: Schema.PropertyKey })
);
const isNumber = Schema.is(Schema.Number);

const invalidRequest = (failure: Schema.SchemaError) =>
  new InvalidRequest({
    details: formatIssues(failure.issue).issues.map((issue) => {
      const path = (issue.path ?? []).map((segment) => {
        const key = isPropertyKeySegment(segment) ? segment.key : segment;
        return isNumber(key) ? key : String(key);
      });
      return {
        code: "invalid",
        // A setting that doesn't exist on a field, option or action.
        message:
          issue.message === "Expected no excess property"
            ? excessKeyMessage(String(path.at(-1)))
            : issue.message,
        path,
      };
    }),
  });

/** Decodes a JSON body with `schema`, reporting every issue. */
const jsonBody = <S extends Schema.Top>(
  schema: S,
  options: { readonly onExcessProperty?: "error" } = {}
) => {
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(schema), {
    errors: "all",
    ...options,
  });
  return (call: Call) =>
    decode(call.body ?? "").pipe(Effect.mapError(invalidRequest));
};

/** Decodes path or query parameters (REST) or tool arguments (MCP) with `schema`. */
const paramsOf = <S extends Schema.Top>(
  schema: S,
  options: { readonly onExcessProperty?: "error" } = {}
) => {
  const decode = Schema.decodeUnknownEffect(schema, {
    errors: "all",
    ...options,
  });
  return (call: Call) =>
    decode(call.params ?? {}).pipe(Effect.mapError(invalidRequest));
};

/** A stored createEvent response: the JSON text of `{ data, success }`. */
const decodeReceipt = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ data: Schema.JsonObject }))
);

const answerOf = (card: Card | null, appUrl: string) =>
  card?.answer ? answerJson(card.eventId, card.answer, appUrl) : null;

/** How delivery to the `callbackUrl` went: null without one. */
const callbackOf = (card: Card | null) =>
  card?.callback
    ? {
        attempts: card.callback.attempts,
        deliveredAt:
          card.callback.deliveredAtMs === null
            ? null
            : toIso(card.callback.deliveredAtMs),
        lastStatus: card.callback.lastStatus,
        url: card.callback.url,
      }
    : null;

/**
 * An event as every operation returns it: the stored event with its
 * fields, actions, answer, callback and resume (`[]`, `[]`, null, null and
 * null when it has none).
 */
const eventData = ({ card, event }: FoundEvent, appUrl: string) => ({
  actions: card?.actions ?? [],
  answer: answerOf(card, appUrl),
  callback: callbackOf(card),
  channelId: event.channelId,
  channelName: event.channelName,
  createdAt: event.createdAt,
  description: event.description,
  displayAs: event.displayAs,
  fields: card?.fields ?? [],
  icon: event.icon,
  id: event.id,
  metadata: event.metadata,
  notify: event.notify,
  resume: card?.resume ?? null,
  source: event.source,
  tags: [...event.tags],
  title: event.title,
  userId: event.userId,
});

/**
 * A replayed createEvent response. Receipts stored before `answer`,
 * `fields` and `actions` existed get them as the event had none.
 */
const replayData = (data: Schema.JsonObject) => ({
  actions: [],
  answer: null,
  callback: null,
  fields: [],
  resume: null,
  ...data,
});

/** The project an event operation works in: the one the API key is bound to. */
const projectOf = ({ principal }: Caller) =>
  principal.projectId === null
    ? Effect.fail(
        new ForbiddenError({ message: "API key is not bound to a project" })
      )
    : Effect.succeed({
        organizationId: principal.organizationId,
        projectId: principal.projectId,
      });

/** 403 for a credential without the operation's scope. */
const missingScope = (
  scope: Scope,
  requestId: string,
  headers: Readonly<Record<string, string>>
): Reply => ({
  body: {
    code: "forbidden",
    error: "Forbidden",
    message: `This API key can't do that: it needs the ${scope} scope (read-only keys have events:read only)`,
    requestId,
    success: false,
  },
  headers,
  status: 403,
});

const unauthorized = (requestId: string): Reply => ({
  body: {
    code: "unauthorized",
    error: "Unauthorized",
    message: "Invalid or missing authentication credentials",
    requestId,
    success: false,
  },
  headers: {
    "WWW-Authenticate": 'Bearer realm="EmitKit", error="invalid_token"',
  },
  status: 401,
});

/** A failed operation's status and body fields; infrastructure failures are logged. */
const failure = (
  errors: Readonly<Record<string, ErrorReply>>,
  error: Tagged
): Effect.Effect<{ status: number; fields: Schema.JsonObject }> => {
  if (error instanceof InvalidRequest) {
    return Effect.succeed({
      fields: {
        code: "validation_error",
        details: error.details,
        error: "Validation error",
      },
      status: 400,
    });
  }
  const reply = errors[error._tag];
  if (!reply) {
    return Effect.die(error);
  }
  const message =
    reply.message ??
    (Predicate.hasProperty(error, "message") &&
    Predicate.isString(error.message)
      ? error.message
      : undefined);
  const fields: Schema.JsonObject =
    message === undefined
      ? { code: reply.code, error: reply.error }
      : { code: reply.code, error: reply.error, message };
  const result = { fields, status: reply.status };
  return error instanceof InfrastructureError
    ? Effect.logError(reply.error, describeFailure(error)).pipe(
        Effect.as(result)
      )
    : Effect.succeed(result);
};

const EVENT_NOT_FOUND = {
  code: "not_found",
  error: "Not found",
  message:
    "No event with this id in the API key's project (events are kept for 90 days)",
  status: 404,
} satisfies ErrorReply;

/**
 * The public REST API operations (openapi/openapi.json). Each one is served
 * the same way: API key first (401/429), then the input (400), then the
 * operation, answered in the contract's envelope with the rate-limit
 * headers. `PublicHttp` routes requests to them; MCP tool calls invoke them
 * directly.
 */
export class PublicApi extends Context.Service<
  PublicApi,
  {
    /** Verifies a credential; a missing, invalid or rate-limited one is answered with its reply. */
    readonly authenticate: (
      credential: string | null
    ) => Effect.Effect<Result.Result<Principal, Reply>, never, RequestId>;
    readonly createEvent: Invoke;
    readonly getEvent: Invoke;
    readonly cancelEvent: Invoke;
    readonly listEvents: Invoke;
    readonly listChannels: Invoke;
    readonly identify: Invoke;
    readonly deleteIdentity: Invoke;
    readonly me: Invoke;
  }
>()("emitkit/public-api/PublicApi") {
  static readonly layer = Layer.effect(
    PublicApi,
    Effect.gen(function* () {
      const auth = yield* Auth;
      const channels = yield* Channels;
      const events = yield* Events;
      const memberships = yield* Memberships;
      const projects = yield* Projects;
      const identities = yield* Identities;
      const idempotency = yield* Idempotency;
      const milestones = yield* Milestones;
      const { apiUrl, appUrl, siteUrl } = yield* AppConfig;
      const siteHost = siteUrl === null ? null : new URL(siteUrl).hostname;
      const ownHosts = new Set([
        new URL(apiUrl).hostname,
        new URL(appUrl).hostname,
        ...(siteHost === null ? [] : [siteHost, `www.${siteHost}`]),
      ]);
      const localDeployment = new URL(appUrl).protocol === "http:";

      /**
       * What the shared schema can't know: https outside local development,
       * and never EmitKit itself (a callback to its own API would loop).
       */
      const callbackUrlIssue = (url: string | undefined) => {
        const target = url === undefined ? null : new URL(url);
        if (target === null) {
          return null;
        }
        // Any port, and `api.emitkit.com.` (a trailing dot) is the same host.
        if (ownHosts.has(target.hostname.replace(/\.$/u, ""))) {
          return "callbackUrl can't point at EmitKit itself; use your own endpoint";
        }
        return target.protocol === "https:" || localDeployment
          ? null
          : "callbackUrl must be https";
      };

      const createEvent = operation({
        scope: "events:write",
        errors: {
          EventTooLargeError: {
            code: "payload_too_large",
            error: "Payload too large",
            message: "Event exceeds the 16 KB storage limit",
            status: 413,
          },
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to create event",
            status: 500,
          },
        },
        input: jsonBody(CreateEventBody, STRICT_PARSE),
        run: Effect.fn("PublicApi.createEvent")(function* (
          caller: Caller,
          event: CreateEventBody
        ) {
          const { idempotencyKey, principal } = caller;
          if (
            idempotencyKey !== undefined &&
            (idempotencyKey.length === 0 || idempotencyKey.length > 255)
          ) {
            return yield* new InvalidRequest({
              details: [
                {
                  code: "invalid",
                  message: "Idempotency-Key must be 1-255 characters",
                  path: ["Idempotency-Key"],
                },
              ],
            });
          }
          const callbackIssue = callbackUrlIssue(event.callbackUrl);
          if (callbackIssue) {
            return yield* new InvalidRequest({
              details: [
                {
                  code: "invalid",
                  message: callbackIssue,
                  path: ["callbackUrl"],
                },
              ],
            });
          }
          const ingest = events
            .ingest(
              {
                organizationId: principal.organizationId,
                projectId: principal.projectId,
              },
              event
            )
            .pipe(
              Effect.tap(() =>
                milestones.eventAccepted(principal.organizationId)
              ),
              Effect.map((created) => eventData(created, appUrl))
            );
          if (idempotencyKey === undefined) {
            return { data: yield* ingest, status: 201 };
          }
          const outcome = yield* idempotency.run(
            {
              apiKeyId: principal.credentialId,
              fingerprint: yield* sha256Hex(
                `${EVENTS_PATH}\n${caller.body ?? ""}`
              ),
              key: idempotencyKey,
            },
            ingest.pipe(
              Effect.map((data) => ({
                body: stringifyJson({ data, success: true }),
                data,
                status: 201,
              }))
            )
          );
          if (!outcome.replayed) {
            return {
              data: outcome.response.data,
              status: outcome.response.status,
            };
          }
          const receipt = yield* decodeReceipt(outcome.response.body).pipe(
            Effect.mapError(infrastructure("idempotency.replay"))
          );
          return {
            data: replayData(receipt.data),
            replayed: true,
            status: outcome.response.status,
          };
        }),
      });

      const getEvent = operation({
        scope: "events:read",
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to read event",
            status: 500,
          },
          NotFoundError: EVENT_NOT_FOUND,
        },
        input: paramsOf(EventIdParams),
        run: Effect.fn("PublicApi.getEvent")(function* (
          caller: Caller,
          { id }: typeof EventIdParams.Type
        ) {
          const found = yield* events.get(yield* projectOf(caller), id);
          return { data: eventData(found, appUrl), status: 200 };
        }),
      });

      const cancelEvent = operation({
        scope: "events:write",
        errors: {
          ConflictError: {
            code: "not_pending",
            error: "Not pending",
            status: 409,
          },
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to cancel event",
            status: 500,
          },
          NotFoundError: EVENT_NOT_FOUND,
          NotWaitingError: {
            code: "not_waiting",
            error: "Not waiting",
            status: 409,
          },
        },
        input: paramsOf(EventIdParams),
        run: Effect.fn("PublicApi.cancelEvent")(function* (
          caller: Caller,
          { id }: typeof EventIdParams.Type
        ) {
          const scope = yield* projectOf(caller);
          yield* events.cancel(scope, id);
          const found = yield* events.get(scope, id);
          return { data: eventData(found, appUrl), status: 200 };
        }),
      });

      const identify = operation({
        scope: "identities:write",
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to identify user",
            message: "The identity could not be written",
            status: 500,
          },
        },
        input: jsonBody(IdentifyBody),
        run: Effect.fn("PublicApi.identify")(function* (
          caller: Caller,
          input: IdentifyBody
        ) {
          const identity = yield* identities.identify(
            caller.principal.organizationId,
            {
              aliases: input.aliases ?? [],
              properties: input.properties ?? {},
              // The body's check guarantees one of them.
              userId: input.userId ?? input.user_id ?? "",
            }
          );
          return {
            data: {
              aliases: { created: [...identity.aliasesCreated] },
              id: identity.id,
              properties: identity.properties,
              updatedAt: identity.updatedAt,
              userId: identity.userId,
            },
            status: 200,
          };
        }),
      });

      const deleteIdentity = operation({
        scope: "identities:write",
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to delete identity",
            message: "The identity could not be erased",
            status: 500,
          },
          NotFoundError: {
            code: "not_found",
            error: "Not found",
            message: "No External Identity matches the supplied user_id",
            status: 404,
          },
        },
        input: paramsOf(UserIdParams),
        run: Effect.fn("PublicApi.deleteIdentity")(function* (
          caller: Caller,
          { user_id: userId }: typeof UserIdParams.Type
        ) {
          const erasure = yield* identities.erase(
            caller.principal.organizationId,
            userId
          );
          return {
            data: {
              aliasesDeleted: erasure.aliasesDeleted,
              id: erasure.id,
              productEventsDetached: 0,
              status: "erased",
              userId: erasure.userId,
            },
            status: 200,
          };
        }),
      });

      const listEvents = operation({
        scope: "events:read",
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to list events",
            status: 500,
          },
        },
        // An unknown parameter (cursor, channelId) would be a filter silently dropped.
        input: paramsOf(ListEventsQuery, { onExcessProperty: "error" }),
        run: Effect.fn("PublicApi.listEvents")(function* (
          caller: Caller,
          query: ListEventsArgs
        ) {
          const { organizationId, projectId } = yield* projectOf(caller);
          // Named the way createEvent names it: `Signups` is `signups`.
          const name =
            query.channel === undefined
              ? undefined
              : slugify(query.channel, "general");
          const channel =
            name === undefined
              ? undefined
              : (yield* channels.list(organizationId, projectId)).find(
                  (candidate) => candidate.name === name
                );
          // An unknown channel has no events yet.
          if (query.channel !== undefined && channel === undefined) {
            return { data: { events: [], nextCursor: null }, status: 200 };
          }
          const { found, nextCursor } = yield* events.page(organizationId, {
            before: query.before,
            channelId: channel?.id,
            limit: query.limit,
            projectId,
            since: query.since,
          });
          return {
            data: {
              events: found.map((item) => eventData(item, appUrl)),
              nextCursor,
            },
            status: 200,
          };
        }),
      });

      const listChannels = operation({
        scope: "events:read",
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to list channels",
            status: 500,
          },
        },
        input: () => Effect.void,
        run: Effect.fn("PublicApi.listChannels")(function* (caller: Caller) {
          const { organizationId, projectId } = yield* projectOf(caller);
          const found = yield* channels.list(organizationId, projectId);
          return {
            data: {
              channels: found.map((channel) => ({
                createdAt: channel.createdAt,
                description: channel.description,
                icon: channel.icon,
                id: channel.id,
                name: channel.name,
              })),
            },
            status: 200,
          };
        }),
      });

      const me = operation({
        scope: null,
        errors: {
          InfrastructureError: {
            code: "internal_error",
            error: "Failed to read the credential",
            status: 500,
          },
        },
        input: () => Effect.void,
        run: Effect.fn("PublicApi.me")(function* ({ principal }: Caller) {
          const { organizationId, projectId, scopes, via } = principal;
          const [owner, project] = yield* Effect.all(
            [
              memberships.owner(organizationId),
              projectId === null
                ? Effect.succeed(null)
                : projects
                    .get(organizationId, projectId)
                    .pipe(
                      Effect.catchTag("NotFoundError", () =>
                        Effect.succeed(null)
                      )
                    ),
            ],
            { concurrency: 2 }
          );
          return {
            data: {
              organization: {
                id: organizationId,
                name: owner?.organizationName ?? null,
              },
              project:
                project === null
                  ? null
                  : { id: project.id, name: project.name },
              scopes: [...scopes],
              via,
            },
            status: 200,
          };
        }),
      });

      /** Verifies the call's API key; a missing, invalid or rate-limited one ends the call. */
      const authenticate = Effect.fnUntraced(function* (
        secret: string | null,
        requestId: string
      ): Effect.fn.Return<Result.Result<Principal, Reply>> {
        if (!secret) {
          return Result.fail(unauthorized(requestId));
        }
        const verdict = yield* auth.verifyApiKey(secret).pipe(Effect.result);
        if (verdict._tag === "Failure") {
          yield* Effect.logError(
            "API key verification failed",
            describeFailure(verdict.failure)
          );
          return Result.fail({
            body: {
              code: "internal_error",
              error: "Internal error",
              requestId,
              success: false,
            },
            headers: {},
            status: 500,
          });
        }
        switch (verdict.success._tag) {
          case "Invalid": {
            return Result.fail(unauthorized(requestId));
          }
          case "RateLimited": {
            return Result.fail({
              body: {
                code: "rate_limited",
                error: "Rate limit exceeded",
                message: "Too many requests. Please try again later.",
                requestId,
                success: false,
              },
              headers: {
                ...rateLimitHeaders(verdict.success.rateLimit),
                "Retry-After": String(verdict.success.retryAfterSeconds),
              },
              status: 429,
            });
          }
          default: {
            const { key } = verdict.success;
            return Result.succeed({
              credentialId: key.id,
              organizationId: key.organizationId,
              projectId: key.projectId,
              rateLimit: key.rateLimit,
              scopes: key.scopes,
              via: "api_key",
            } satisfies Principal);
          }
        }
      });

      /** Answers calls of an operation: authenticate, decode, run, encode. */
      const serve = <I>(op: Operation<I>): Invoke =>
        Effect.fnUntraced(function* (
          call: Call
        ): Effect.fn.Return<Reply, never, RequestId> {
          const requestId = yield* RequestId;
          const verified = call.principal
            ? Result.succeed(call.principal)
            : yield* authenticate(call.credential, requestId);
          if (Result.isFailure(verified)) {
            return verified.failure;
          }
          const principal = verified.success;
          const headers = rateLimitHeaders(principal.rateLimit);
          if (op.scope !== null && !principal.scopes.includes(op.scope)) {
            return missingScope(op.scope, requestId, headers);
          }
          const outcome = yield* op.input(call).pipe(
            Effect.flatMap((input) => op.run({ ...call, principal }, input)),
            Effect.result
          );
          if (outcome._tag === "Failure") {
            const { fields, status } = yield* failure(
              op.errors,
              outcome.failure
            );
            return {
              body: { success: false, ...fields, requestId },
              headers,
              status,
            };
          }
          const { data, replayed, status } = outcome.success;
          if (replayed) {
            headers["X-Idempotent-Replay"] = "true";
          }
          return { body: { data, requestId, success: true }, headers, status };
        });

      return PublicApi.of({
        authenticate: (credential) =>
          RequestId.use((requestId) => authenticate(credential, requestId)),
        cancelEvent: serve(cancelEvent),
        createEvent: serve(createEvent),
        deleteIdentity: serve(deleteIdentity),
        getEvent: serve(getEvent),
        identify: serve(identify),
        listChannels: serve(listChannels),
        listEvents: serve(listEvents),
        me: serve(me),
      });
    })
  );
}
