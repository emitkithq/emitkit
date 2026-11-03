import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { connectingRoleSql } from "@server/oauth/grants";
import { AppConfig } from "@server/platform/config";
import { sha256Hex } from "@server/platform/ids";
import { stringifyJson } from "@server/platform/json";
import { EventsQueue } from "@server/platform/queue";
import { toIso } from "@server/platform/time";
import { constantTimeEqual } from "@server/platform/webhook-signature";
import { isSigningSecret, Webhooks } from "@server/platform/webhooks";
import { slugify } from "@server/slug";
import type {
  McpDeliveryMessage,
  McpFanOutMessage,
  QueueMessage,
} from "@shared/queue";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

type JsonObject = Readonly<Record<string, Schema.Json>>;

/**
 * Who subscribes: an API key (`key_…`) or an OAuth grant (`grant_…`, the
 * consent id), with the project it acts on.
 */
export interface Subscriber {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
}

/**
 * The subscription's principal still has access: its API key exists and is
 * enabled, or its OAuth grant exists and its user may still connect apps
 * (`OAuthGrants`' role rule). Expects the subscription as `s`.
 */
const LIVE_PRINCIPAL = `(
  exists (select 1 from apikey k where k.id = s.principal_id and coalesce(k.enabled, 1) = 1)
  or exists (
    select 1 from "oauthConsent" c
    join member m on m."userId" = c."userId" and m."organizationId" = s.organization_id
    where c.id = s.principal_id and c."referenceId" = s.project_id
      and ${connectingRoleSql("m.role")}
  )
)`;

/** JSON-RPC error codes of the MCP Events draft. */
export const EventsErrorCode = {
  CallbackEndpointError: -32_015,
  Forbidden: -32_012,
  InvalidParams: -32_602,
  NotFound: -32_011,
  ResourceExhausted: -32_013,
  Unsupported: -32_014,
};

/** A request `events/*` refuses, carried to the client as a JSON-RPC error. */
export class McpEventsError extends Schema.TaggedError<McpEventsError>()(
  "McpEventsError",
  {
    code: Schema.Number,
    data: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
    message: Schema.String,
  }
) {}

/** A delivery the receiver didn't accept yet (a network failure, 408, 429 or 5xx): retried. */
export class WebhookDeliveryError extends Schema.TaggedError<WebhookDeliveryError>()(
  "WebhookDeliveryError",
  { reason: Schema.String, subscriptionId: Schema.String }
) {}

const invalid = (message: string) =>
  new McpEventsError({ code: EventsErrorCode.InvalidParams, message });

const EVENT_CREATED = "event.created";

const unknownEvent = (name: string) =>
  new McpEventsError({
    code: EventsErrorCode.NotFound,
    data: { kind: "event" },
    message: `Unknown event: ${name}`,
  });

/** The `events/list` catalogue. */
export const EVENT_DEFINITIONS: readonly JsonObject[] = [
  {
    delivery: ["webhook"],
    description:
      "An event was created in the project bound to your API key. Events created with the subscribing key itself are not delivered, so an agent that reacts by creating an event doesn't hear its own.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        channel: {
          description:
            "Only events in this channel, by name (matched the way EmitKit names channels: lowercase, spaces become dashes)",
          maxLength: 255,
          minLength: 1,
          type: "string",
        },
        tags: {
          description: "Only events carrying every one of these tags",
          items: { maxLength: 255, minLength: 1, type: "string" },
          maxItems: 10,
          type: "array",
        },
        userId: {
          description:
            "Only events about this user (your user id, after alias resolution)",
          minLength: 1,
          type: "string",
        },
      },
      type: "object",
    },
    name: EVENT_CREATED,
    payloadSchema: {
      properties: {
        channel: { description: "Channel name", type: "string" },
        createdAt: { format: "date-time", type: "string" },
        description: { type: ["string", "null"] },
        icon: { description: "An emoji", type: ["string", "null"] },
        id: { description: "Event id", type: "string" },
        metadata: { type: "object" },
        source: { type: "string" },
        tags: { items: { type: "string" }, type: "array" },
        title: { type: "string" },
        url: {
          description: "The event's channel in the EmitKit dashboard",
          format: "uri",
          type: "string",
        },
        userId: { type: ["string", "null"] },
      },
      required: [
        "id",
        "channel",
        "title",
        "tags",
        "metadata",
        "createdAt",
        "url",
      ],
      type: "object",
    },
  },
];

const Json = Schema.Record(Schema.String, Schema.Json);

const SubscribeParams = Schema.Struct({
  arguments: Schema.optional(Json),
  cursor: Schema.optional(Schema.NullOr(Schema.String)),
  delivery: Schema.Struct({
    mode: Schema.String,
    secret: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
  name: Schema.String,
  ttlMs: Schema.optional(Schema.NullOr(Schema.Number)),
});

const UnsubscribeParams = Schema.Struct({
  arguments: Schema.optional(Json),
  delivery: Schema.Struct({ url: Schema.String }),
  name: Schema.String,
});

const text = (max: number) =>
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max));

const EventCreatedArguments = Schema.Struct({
  channel: Schema.optional(text(255)),
  tags: Schema.optional(Schema.Array(text(255)).check(Schema.isMaxLength(10))),
  userId: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
});
type EventCreatedArguments = typeof EventCreatedArguments.Type;

const decodeArguments = Schema.decodeUnknownOption(EventCreatedArguments, {
  onExcessProperty: "error",
});
const decodeStoredArguments = Schema.decodeUnknownOption(
  Schema.fromJsonString(EventCreatedArguments)
);
const decodeMetadata = Schema.decodeUnknownOption(Schema.fromJsonString(Json));

/** Sorted keys and no absent values, so equal filters compare equal. */
const canonicalArguments = (args: EventCreatedArguments) => {
  const canonical: Record<string, Schema.Json> = {};
  if (args.channel !== undefined) {
    canonical.channel = args.channel;
  }
  if (args.tags !== undefined) {
    canonical.tags = [...args.tags];
  }
  if (args.userId !== undefined) {
    canonical.userId = args.userId;
  }
  return stringifyJson(canonical);
};

const matches = (
  args: EventCreatedArguments,
  event: McpFanOutMessage
): boolean =>
  (args.channel === undefined ||
    slugify(args.channel, "general") === event.channelName) &&
  (args.tags === undefined ||
    args.tags.every((tag) => event.tags.includes(tag))) &&
  (args.userId === undefined || args.userId === event.userId);

const MINUTE_MS = 60_000;
const DEFAULT_TTL_MS = 24 * 60 * MINUTE_MS;
const MAX_TTL_MS = 7 * DEFAULT_TTL_MS;
const MIN_TTL_MS = MINUTE_MS;
/** How long a replaced signing secret keeps signing alongside the new one. */
const ROTATION_WINDOW_MS = 60 * MINUTE_MS;
const MAX_SUBSCRIPTIONS_PER_KEY = 25;
/** Receivers may reject larger bodies with 413. */
const MAX_DELIVERY_BYTES = 256 * 1024;
/** Cloudflare Queues: at most 100 messages and 256 KB per batch. */
const BATCH_MESSAGES = 100;
const BATCH_BYTES = 200_000;

const grantedTtl = (requested: number | null | undefined) => {
  if (requested === undefined) {
    return DEFAULT_TTL_MS;
  }
  if (requested === null) {
    return MAX_TTL_MS;
  }
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, requested));
};

interface SubscriptionRow {
  readonly id: string;
  readonly principal_id: string;
  readonly arguments: string;
  readonly url: string;
  readonly secret: string;
  readonly previous_secret: string | null;
  readonly previous_secret_until: string | null;
  readonly last_delivery_at: string | null;
  readonly last_error: string | null;
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/** Splits queue messages into batches Cloudflare Queues accepts. */
const batches = (messages: readonly McpDeliveryMessage[]) => {
  const result: McpDeliveryMessage[][] = [];
  let current: McpDeliveryMessage[] = [];
  let bytes = 0;
  for (const message of messages) {
    const size = byteLength(message.body) + 256;
    if (
      current.length > 0 &&
      (current.length === BATCH_MESSAGES || bytes + size > BATCH_BYTES)
    ) {
      result.push(current);
      current = [];
      bytes = 0;
    }
    current.push(message);
    bytes += size;
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result;
};

/** Deterministic over (API key, callback URL, event name, canonical arguments). */
const subscriptionId = (
  principal: Subscriber,
  url: string,
  name: string,
  args: string
) =>
  sha256Hex(`${principal.id}\n${url}\n${name}\n${args}`).pipe(
    Effect.map((hash) => `sub_${hash.slice(0, 32)}`)
  );

const verificationFailure = (reason: string) =>
  new McpEventsError({
    code: EventsErrorCode.CallbackEndpointError,
    data: { reason },
    message: `The callback endpoint failed verification (${reason})`,
  });

/**
 * MCP Events (webhook delivery) for the `/mcp` endpoint: the event
 * catalogue, subscriptions keyed by (API key, callback URL, event name,
 * arguments), callback verification, and signed delivery through the queue.
 */
export class McpEvents extends Context.Service<
  McpEvents,
  {
    readonly subscribe: (
      principal: Subscriber,
      params: JsonObject
    ) => Effect.Effect<JsonObject, McpEventsError | InfrastructureError>;
    readonly unsubscribe: (
      principal: Subscriber,
      params: JsonObject
    ) => Effect.Effect<void, McpEventsError | InfrastructureError>;
    /** Queue consumer: one delivery message per matching subscription. */
    readonly fanOut: (
      message: McpFanOutMessage
    ) => Effect.Effect<void, InfrastructureError>;
    /**
     * Queue consumer: signs and sends one delivery. Fails with
     * WebhookDeliveryError when it should be retried; a 410 deletes the
     * subscription, and other refusals drop the delivery.
     */
    readonly deliver: (
      message: McpDeliveryMessage
    ) => Effect.Effect<void, WebhookDeliveryError | InfrastructureError>;
    /** Deletes subscriptions that weren't refreshed in time. */
    readonly expire: (
      nowMs: number
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/mcp/McpEvents") {
  static readonly layer = Layer.effect(
    McpEvents,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const webhooks = yield* Webhooks;
      const queue = yield* EventsQueue;
      const { appUrl } = yield* AppConfig;

      /** The event name and filter arguments shared by subscribe and unsubscribe. */
      const target = Effect.fnUntraced(function* (
        name: string,
        rawArguments: JsonObject | undefined
      ) {
        if (name !== EVENT_CREATED) {
          return yield* unknownEvent(name);
        }
        const args = decodeArguments(rawArguments ?? {});
        if (Option.isNone(args)) {
          return yield* invalid(
            "arguments must match the event's inputSchema (channel, tags, userId)"
          );
        }
        return canonicalArguments(args.value);
      });

      /**
       * Proves the receiver asked for these deliveries: a signed
       * `verification` envelope whose single-use challenge must come back
       * in a 2xx reply (as `{"challenge": …}` or the bare value).
       */
      const verify = Effect.fn("McpEvents.verify")(function* (
        id: string,
        url: string,
        secret: string
      ) {
        const challenge = yield* webhooks.nonce;
        const reply = yield* webhooks
          .post({
            body: stringifyJson({ challenge, type: "verification" }),
            id: `msg_verification_${yield* webhooks.nonce}`,
            secrets: [secret],
            subscriptionId: id,
            url,
          })
          .pipe(
            Effect.catchTag("WebhookTransportError", (error) =>
              Effect.fail(
                new McpEventsError({
                  code: EventsErrorCode.CallbackEndpointError,
                  data: { reason: error.reason },
                  message: "The callback endpoint could not be reached",
                })
              )
            )
          );
        if (reply.status >= 500) {
          return yield* verificationFailure("http_5xx");
        }
        if (reply.status >= 400) {
          return yield* verificationFailure("http_4xx");
        }
        if (reply.status < 200 || reply.status >= 300) {
          return yield* verificationFailure("challenge_failed");
        }
        const echoed = Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Struct({ challenge: Schema.String }))
        )(reply.text).pipe(
          Option.map((body) => body.challenge),
          Option.getOrElse(() => reply.text.trim())
        );
        if (!constantTimeEqual(echoed, challenge)) {
          return yield* verificationFailure("challenge_failed");
        }
      });

      const subscribe = Effect.fn("McpEvents.subscribe")(function* (
        principal: Subscriber,
        raw: JsonObject
      ) {
        const params = Schema.decodeUnknownOption(SubscribeParams)(raw);
        if (Option.isNone(params)) {
          return yield* invalid(
            "events/subscribe needs name, arguments and delivery"
          );
        }
        const { delivery, name, ttlMs } = params.value;
        if (name !== EVENT_CREATED) {
          return yield* unknownEvent(name);
        }
        if (delivery.mode !== "webhook") {
          return yield* new McpEventsError({
            code: EventsErrorCode.Unsupported,
            data: { feature: `delivery.mode:${delivery.mode}` },
            message: "EmitKit delivers events by webhook only",
          });
        }
        const url = delivery.url ?? "";
        const problem = webhooks.callbackProblem(url);
        if (problem) {
          return yield* invalid(problem);
        }
        const secret = delivery.secret ?? "";
        if (!isSigningSecret(secret)) {
          return yield* invalid(
            "delivery.secret must be whsec_ followed by base64 of 24-64 bytes"
          );
        }
        const args = yield* target(name, params.value.arguments);
        const id = yield* subscriptionId(principal, url, name, args);
        const nowMs = yield* Clock.currentTimeMillis;
        const now = toIso(nowMs);
        const refreshBefore = toIso(nowMs + grantedTtl(ttlMs));
        const [existing] = yield* sql<SubscriptionRow>`
          select * from mcp_subscription where id = ${id} and principal_id = ${principal.id}
        `.pipe(Effect.mapError(infrastructure("mcpEvents.find")));

        if (existing) {
          const rotated = existing.secret !== secret;
          yield* sql`
            update mcp_subscription set
              secret = ${secret},
              previous_secret = ${rotated ? existing.secret : existing.previous_secret},
              previous_secret_until = ${rotated ? toIso(nowMs + ROTATION_WINDOW_MS) : existing.previous_secret_until},
              refresh_before = ${refreshBefore},
              updated_at = ${now}
            where id = ${id}
          `.pipe(Effect.mapError(infrastructure("mcpEvents.refresh")));
        } else {
          const siblings = yield* sql<{
            readonly total: number;
            readonly same_url: number;
          }>`
            select count(*) as total, coalesce(sum(url = ${url}), 0) as same_url
            from mcp_subscription where principal_id = ${principal.id}
          `.pipe(Effect.mapError(infrastructure("mcpEvents.count")));
          const [counts] = siblings;
          if ((counts?.total ?? 0) >= MAX_SUBSCRIPTIONS_PER_KEY) {
            return yield* new McpEventsError({
              code: EventsErrorCode.ResourceExhausted,
              data: { limit: "subscriptions", max: MAX_SUBSCRIPTIONS_PER_KEY },
              message: `An API key or connected app can hold ${MAX_SUBSCRIPTIONS_PER_KEY} subscriptions`,
            });
          }
          // A callback URL this principal already verified doesn't need a new handshake.
          if ((counts?.same_url ?? 0) === 0) {
            yield* verify(id, url, secret);
          }
          yield* sql`
            insert into mcp_subscription ${sql.insert({
              principal_id: principal.id,
              arguments: args,
              created_at: now,
              id,
              name,
              organization_id: principal.organizationId,
              project_id: principal.projectId,
              refresh_before: refreshBefore,
              secret,
              updated_at: now,
              url,
            })}
            on conflict (id) do update set secret = excluded.secret, refresh_before = excluded.refresh_before, updated_at = excluded.updated_at
          `.pipe(Effect.mapError(infrastructure("mcpEvents.insert")));
        }
        return {
          cursor: null,
          id,
          refreshBefore,
          truncated: false,
        } satisfies JsonObject;
      });

      const unsubscribe = Effect.fn("McpEvents.unsubscribe")(function* (
        principal: Subscriber,
        raw: JsonObject
      ) {
        const params = Schema.decodeUnknownOption(UnsubscribeParams)(raw);
        if (Option.isNone(params)) {
          return yield* invalid(
            "events/unsubscribe needs name, arguments and delivery.url"
          );
        }
        const { delivery, name } = params.value;
        const args = yield* target(name, params.value.arguments);
        const id = yield* subscriptionId(principal, delivery.url, name, args);
        yield* sql`
          delete from mcp_subscription where id = ${id} and principal_id = ${principal.id}
        `.pipe(Effect.mapError(infrastructure("mcpEvents.unsubscribe")));
      });

      const fanOut = Effect.fn("McpEvents.fanOut")(function* (
        event: McpFanOutMessage
      ) {
        const nowIso = toIso(yield* Clock.currentTimeMillis);
        const rows = yield* sql<{
          readonly id: string;
          readonly arguments: string;
          readonly slug: string;
        }>`
          select s.id, s.arguments, o.slug
          from mcp_subscription s
          join organization o on o.id = s.organization_id
          where s.project_id = ${event.projectId} and s.name = ${EVENT_CREATED}
            and s.refresh_before > ${nowIso}
            and s.principal_id is not ${event.principalId}
            and ${sql.literal(LIVE_PRINCIPAL)}
        `.pipe(Effect.mapError(infrastructure("mcpEvents.fanOut")));
        const targets = rows.filter((row) =>
          decodeStoredArguments(row.arguments).pipe(
            Option.exists((args) => matches(args, event))
          )
        );
        const [first] = targets;
        if (!first) {
          return;
        }
        const body = stringifyJson({
          cursor: null,
          data: {
            channel: event.channelName,
            createdAt: toIso(event.createdAtMs),
            description: event.description,
            icon: event.icon,
            id: event.eventId,
            metadata: decodeMetadata(event.metadata).pipe(
              Option.getOrElse((): JsonObject => ({}))
            ),
            source: event.source,
            tags: [...event.tags],
            title: event.title,
            url: `${appUrl}/${first.slug}?channelId=${event.channelId}`,
            userId: event.userId,
          },
          eventId: event.eventId,
          name: EVENT_CREATED,
          timestamp: toIso(event.createdAtMs),
        });
        if (byteLength(body) > MAX_DELIVERY_BYTES) {
          yield* Effect.logWarning("MCP event over 256 KiB not delivered", {
            eventId: event.eventId,
          });
          return;
        }
        const deliveries = targets.map((row): McpDeliveryMessage => ({
          body,
          eventId: event.eventId,
          subscriptionId: row.id,
          type: "mcp.delivery",
        }));
        yield* Effect.forEach(
          batches(deliveries),
          (batch) => queue.sendBatch(batch satisfies readonly QueueMessage[]),
          { discard: true }
        );
        yield* Effect.logInfo("MCP Events fan-out", {
          eventId: event.eventId,
          subscribers: deliveries.length,
        });
      });

      const recordError = (id: string, error: string) =>
        sql`update mcp_subscription set last_error = ${error} where id = ${id}`.pipe(
          Effect.mapError(infrastructure("mcpEvents.recordError"))
        );

      const deliver = Effect.fn("McpEvents.deliver")(function* (
        message: McpDeliveryMessage
      ): Effect.fn.Return<void, WebhookDeliveryError | InfrastructureError> {
        const nowMs = yield* Clock.currentTimeMillis;
        const nowIso = toIso(nowMs);
        // Unsubscribed, expired, revoked key or grant, or deleted project: drop.
        const [row] = yield* sql<SubscriptionRow>`
          select s.* from mcp_subscription s
          join project p on p.id = s.project_id and p.deleted_at is null
          where s.id = ${message.subscriptionId} and s.refresh_before > ${nowIso}
            and ${sql.literal(LIVE_PRINCIPAL)}
        `.pipe(Effect.mapError(infrastructure("mcpEvents.load")));
        if (!row) {
          return;
        }
        const secrets =
          row.previous_secret &&
          row.previous_secret_until &&
          row.previous_secret_until > nowIso
            ? [row.secret, row.previous_secret]
            : [row.secret];
        const reply = yield* webhooks
          .post({
            body: message.body,
            id: message.eventId,
            secrets,
            subscriptionId: row.id,
            url: row.url,
          })
          .pipe(Effect.result);
        if (reply._tag === "Failure") {
          if (reply.failure._tag === "InfrastructureError") {
            return yield* reply.failure;
          }
          const { reason } = reply.failure;
          yield* recordError(row.id, reason);
          return yield* new WebhookDeliveryError({
            reason,
            subscriptionId: row.id,
          });
        }
        const { status } = reply.success;
        if (status >= 200 && status < 300) {
          yield* sql`
            update mcp_subscription set last_delivery_at = ${nowIso}, last_error = null where id = ${row.id}
          `.pipe(Effect.mapError(infrastructure("mcpEvents.delivered")));
          return;
        }
        if (status === 410) {
          yield* sql`delete from mcp_subscription where id = ${row.id}`.pipe(
            Effect.mapError(infrastructure("mcpEvents.gone"))
          );
          return;
        }
        yield* recordError(row.id, `http_${status}`);
        if (status === 408 || status === 429 || status >= 500) {
          return yield* new WebhookDeliveryError({
            reason: `http_${status}`,
            subscriptionId: row.id,
          });
        }
      });

      const expire = Effect.fn("McpEvents.expire")(function* (nowMs: number) {
        const rows = yield* sql<{ readonly id: string }>`
          delete from mcp_subscription where refresh_before <= ${toIso(nowMs)} returning id
        `.pipe(Effect.mapError(infrastructure("mcpEvents.expire")));
        return rows.length;
      });

      return McpEvents.of({
        deliver,
        expire,
        fanOut,
        subscribe,
        unsubscribe,
      });
    })
  );
}
