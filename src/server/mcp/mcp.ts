import { describeFailure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import {
  EVENT_DEFINITIONS,
  EventsErrorCode,
  McpEvents,
} from "@server/mcp/events";
import type { Subscriber } from "@server/mcp/events";
import { OAuthGrants } from "@server/oauth/grants";
import type { GrantVerdict } from "@server/oauth/grants";
import { Auth } from "@server/platform/auth";
import { API_KEY_PREFIX, MCP_SCOPE } from "@server/platform/auth-options";
import { AppConfig } from "@server/platform/config";
import { stringifyJson } from "@server/platform/json";
import {
  credential,
  header,
  json,
  rateLimitHeaders,
  RequestId,
} from "@server/public-api/http";
import type { Endpoint } from "@server/public-api/http";
import { PublicApi } from "@server/public-api/public-api";
import type { Invoke, Principal } from "@server/public-api/public-api";
import {
  CreateEventBody,
  EventIdParams,
  IdentifyBody,
  ListEventsArgs,
  UserIdParams,
} from "@server/public-api/schemas";
import { ALL_SCOPES } from "@shared/scopes";
import type { Scope } from "@shared/scopes";
import {
  Context,
  Effect,
  Encoding,
  Layer,
  Option,
  Result,
  Schema,
} from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

/** Per-request metadata, no `initialize` handshake (MCP 2.0). */
const MODERN_VERSION = "2026-07-28";
/** Session-era versions, negotiated by `initialize`. */
const PROTOCOL_VERSIONS: readonly string[] = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
const SUPPORTED_VERSIONS = [MODERN_VERSION, ...PROTOCOL_VERSIONS];
const META_VERSION = "io.modelcontextprotocol/protocolVersion";

const SERVER_INFO = { name: "emitkit", title: "EmitKit", version: "3.0.0" };
const INSTRUCTIONS =
  "Send events to the project bound to your API key, and ask people for decisions: an event with buttons or fields waits for an answer on their phone (read it with getEvent). Also lists recent events and channels, and manages identities.";
const DISCOVER_INSTRUCTIONS = `${INSTRUCTIONS} Subscribe to event.created to hear about new events by webhook.`;

const JsonRpcRequest = Schema.Struct({
  id: Schema.optional(
    Schema.Union([Schema.String, Schema.Number, Schema.Null])
  ),
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.String,
  params: Schema.optional(Schema.JsonObject),
});
type JsonRpcRequest = typeof JsonRpcRequest.Type;
const decodeJsonRpcRequest = Schema.decodeUnknownOption(
  Schema.fromJsonString(JsonRpcRequest)
);

const RequestMeta = Schema.Struct({
  _meta: Schema.Struct({ [META_VERSION]: Schema.String }),
});
const metaVersionOf = (params: JsonRpcRequest["params"]) =>
  Schema.decodeUnknownOption(RequestMeta)(params).pipe(
    Option.map((decoded) => decoded._meta[META_VERSION]),
    Option.getOrUndefined
  );

const ToolCall = Schema.Struct({
  arguments: Schema.optional(Schema.JsonObject),
  name: Schema.String,
});
const decodeToolCall = Schema.decodeUnknownOption(ToolCall);

/** A tool's input schema, generated from the schema its operation decodes with. */
const inputSchemaOf = (
  schema: Schema.Top,
  onExcessProperty: "error" | "ignore" = "ignore"
) =>
  Schema.decodeUnknownSync(Schema.JsonObject)(
    Schema.toJsonSchemaDocument(schema, { onExcessProperty }).schema
  );

/** createEvent's arguments: the REST body plus the Idempotency-Key header. */
const createEventInput = (() => {
  const body = inputSchemaOf(CreateEventBody, "error");
  const properties = Schema.decodeUnknownSync(Schema.JsonObject)(
    body.properties ?? {}
  );
  return {
    ...body,
    properties: {
      ...properties,
      idempotencyKey: {
        description:
          "Retries with the same key replay the first result instead of creating a second event (the Idempotency-Key header over REST)",
        maxLength: 255,
        minLength: 1,
        type: "string",
      },
    },
  };
})();

const IdempotencyKeyArgument = Schema.Struct({
  idempotencyKey: Schema.optionalKey(Schema.String),
});
const idempotencyKeyOf = (args: Schema.JsonObject) =>
  Schema.decodeUnknownOption(IdempotencyKeyArgument)(args).pipe(
    Option.flatMap((decoded) => Option.fromNullishOr(decoded.idempotencyKey)),
    Option.map((key) => key.trim()),
    Option.getOrUndefined
  );

/** Every tool needs a token with the `mcp` scope (ChatGPT reads this per tool). */
const SECURITY_SCHEMES = [{ scopes: [MCP_SCOPE], type: "oauth2" }];

/**
 * The MCP tools: each runs one public API operation, so validation, errors
 * and results are the REST API's (tool arguments are the body, or the path
 * or query parameters). A credential only sees the tools its scopes allow.
 */
interface Tool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Schema.JsonObject;
  readonly annotations: {
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly readOnlyHint: boolean;
  };
  /** Shown to, and callable by, credentials with this scope. */
  readonly scope: Scope;
  readonly call: (
    args: Schema.JsonObject,
    principal: Principal
  ) => ReturnType<Invoke>;
}

const tools = (api: PublicApi["Service"]) => {
  const list: readonly Tool[] = [
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        readOnlyHint: false,
      },
      call: (args, principal) => {
        const { idempotencyKey: _key, ...event } = args;
        return api.createEvent({
          body: stringifyJson({ source: "mcp", ...event }),
          credential: null,
          idempotencyKey: idempotencyKeyOf(args),
          principal,
        });
      },
      description:
        "Create an Event in a channel of the project bound to this API key. The channel is created on first use; subscribed devices get a push notification unless notify is false. To ask a person something, add actions with an id (buttons) and/or fields: the event then waits for an answer on their phone (data.answer.status is pending). Read the answer with getEvent.",
      inputSchema: createEventInput,
      name: "createEvent",
      scope: "events:write",
      title: "Create Event",
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        readOnlyHint: true,
      },
      call: (args, principal) =>
        api.getEvent({ credential: null, params: args, principal }),
      description:
        "Read an event by id, with its answer: data.answer.status is pending, answered, expired or canceled (answer is null when the event doesn't ask anything). Once answered, data.answer.action is the pressed button's id and data.answer.values holds the fields by id.",
      inputSchema: inputSchemaOf(EventIdParams),
      name: "getEvent",
      scope: "events:read",
      title: "Get Event",
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        readOnlyHint: true,
      },
      call: (args, principal) =>
        api.listEvents({ credential: null, params: args, principal }),
      description:
        "List the project's recent events, newest first, each with its answer when it asked something. Filter by channel name or time; pass data.nextCursor as before to get the next page.",
      inputSchema: inputSchemaOf(ListEventsArgs),
      name: "listEvents",
      scope: "events:read",
      title: "List Events",
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        readOnlyHint: true,
      },
      call: (_args, principal) =>
        api.listChannels({ credential: null, principal }),
      description:
        "List the project's channels (name, icon, description), to send an event to an existing channel.",
      inputSchema: { properties: {}, type: "object" },
      name: "listChannels",
      scope: "events:read",
      title: "List Channels",
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        readOnlyHint: false,
      },
      call: (args, principal) =>
        api.cancelEvent({ credential: null, params: args, principal }),
      description:
        "Stop a pending event from waiting when you no longer need the answer. Canceling twice is fine. Fails with code not_pending once it was answered or expired, and not_waiting when the event never asked anything.",
      inputSchema: inputSchemaOf(EventIdParams),
      name: "cancelEvent",
      scope: "events:write",
      title: "Cancel Event",
    },
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        readOnlyHint: false,
      },
      call: (args, principal) =>
        api.identify({
          body: stringifyJson(args),
          credential: null,
          principal,
        }),
      description:
        "Create or update the External Identity for one of your users, merging properties and claiming aliases.",
      inputSchema: inputSchemaOf(IdentifyBody),
      name: "identifyUser",
      scope: "identities:write",
      title: "Identify user",
    },
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        readOnlyHint: false,
      },
      call: (args, principal) =>
        api.deleteIdentity({ credential: null, params: args, principal }),
      description:
        "Erase an External Identity: deletes its properties and aliases and detaches it from past events.",
      inputSchema: inputSchemaOf(UserIdParams),
      name: "deleteIdentity",
      scope: "identities:write",
      title: "Delete identity",
    },
  ];
  const allowed = (principal: Principal) =>
    list.filter((tool) => principal.scopes.includes(tool.scope));
  return {
    /** Every tool: one outside the principal's scopes answers REST's 403, naming the scope. */
    byName: new Map(list.map((tool) => [tool.name, tool])),
    /** What `tools/list` shows the principal. */
    listed: (principal: Principal) =>
      allowed(principal).map((tool): Schema.JsonObject => ({
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
        securitySchemes: SECURITY_SCHEMES,
        title: tool.title,
      })),
  };
};

/** What a method answers: a result, or a JSON-RPC error (with its HTTP status on modern requests). */
type Reply =
  | { readonly _tag: "Result"; readonly result: Schema.JsonObject }
  | {
      readonly _tag: "Error";
      readonly code: number;
      readonly message: string;
      readonly data?: Schema.JsonObject | undefined;
      readonly status?: number;
    };

const ok = (result: Schema.JsonObject): Reply => ({ _tag: "Result", result });
const fail = (
  code: number,
  message: string,
  data?: Schema.JsonObject,
  status?: number
): Reply => ({ _tag: "Error", code, data, message, status });

const errorBody = (
  reply: Extract<Reply, { _tag: "Error" }>
): Schema.JsonObject =>
  reply.data === undefined
    ? { code: reply.code, message: reply.message }
    : { code: reply.code, data: reply.data, message: reply.message };

/** Modern results carry `resultType`, and their errors their HTTP status. */
const respond = (
  id: JsonRpcRequest["id"] | null,
  reply: Reply,
  modern: boolean
) =>
  reply._tag === "Result"
    ? json(200, {
        id: id ?? null,
        jsonrpc: "2.0",
        result: modern
          ? { ...reply.result, resultType: "complete" }
          : reply.result,
      })
    : json(modern ? (reply.status ?? 200) : 200, {
        error: errorBody(reply),
        id: id ?? null,
        jsonrpc: "2.0",
      });

const headerMismatch = (message: string) =>
  fail(-32_020, `Header mismatch: ${message}`, undefined, 400);

const BASE64_SENTINEL = /^=\?base64\?(?<value>.*)\?=$/u;

/** A mirrored header value, with the `=?base64?…?=` sentinel decoded. */
const headerValue = (value: string | undefined) => {
  const encoded = value?.match(BASE64_SENTINEL)?.groups?.value;
  if (encoded === undefined) {
    return value;
  }
  return Encoding.decodeBase64String(encoded).pipe(Result.getOrElse(() => ""));
};

/** The subscriber behind `events/*`: a principal that reads events in a project. */
const subscriberOf = (
  principal: Principal
): Result.Result<Subscriber, Reply> => {
  if (!principal.scopes.includes("events:read")) {
    return Result.fail(
      fail(
        EventsErrorCode.Forbidden,
        "Subscribing to events needs the events:read scope"
      )
    );
  }
  return principal.projectId === null
    ? Result.fail(
        fail(EventsErrorCode.Forbidden, "API key is not bound to a project")
      )
    : Result.succeed({
        id: principal.credentialId,
        organizationId: principal.organizationId,
        projectId: principal.projectId,
      });
};

/** An HTTP response refusing the credential. */
const refused = (
  status: number,
  body: Schema.JsonObject,
  headers: Readonly<Record<string, string>>
) => Result.fail(json(status, body, headers));

/**
 * Model Context Protocol endpoint (`/mcp` on the API host): stateless
 * Streamable HTTP with JSON responses. Callers use an API key or an OAuth
 * access token. Each request authenticates once, before any method (a bad
 * credential is an HTTP 401, a spent rate limit a 429), and counts once
 * against its rate limit. Tool calls run the public API operations for that
 * principal, so they answer with REST's bodies.
 *
 * Both protocol eras are served. A request whose `params._meta` carries a
 * protocol version (or whose `MCP-Protocol-Version` isn't a session-era
 * version) is modern (2026-07-28): its mirrored headers are validated, its
 * results carry `resultType`, and it can use `server/discover` and MCP
 * Events (`events/list`, `events/subscribe`, `events/unsubscribe`), which
 * need MCP 2.0. Everything else is answered as before, starting with
 * `initialize`.
 */
export class McpServer extends Context.Service<
  McpServer,
  { readonly handle: Endpoint }
>()("emitkit/mcp/McpServer") {
  static readonly layer = Layer.effect(
    McpServer,
    Effect.gen(function* () {
      const api = yield* PublicApi;
      const auth = yield* Auth;
      const grants = yield* OAuthGrants;
      const config = yield* AppConfig;
      const events = yield* McpEvents;

      const { byName, listed } = tools(api);

      const callTool = Effect.fn("McpServer.callTool")(function* (
        principal: Principal,
        rpc: JsonRpcRequest
      ) {
        const call = decodeToolCall(rpc.params);
        if (Option.isNone(call)) {
          return fail(-32_602, "Invalid tool call parameters");
        }
        const { name } = call.value;
        const tool = byName.get(name);
        if (!tool) {
          const names = listed(principal).map((listing) => listing.name);
          return fail(
            -32_602,
            `Unknown tool: ${name}. Tools: ${names.join(", ")}`
          );
        }
        const { body, status } = yield* tool.call(
          call.value.arguments ?? {},
          principal
        );
        return ok({
          content: [{ text: stringifyJson(body), type: "text" }],
          isError: status >= 400,
          structuredContent: body,
        });
      });

      const eventsCall = Effect.fn("McpServer.eventsCall")(function* (
        principal: Principal,
        rpc: JsonRpcRequest,
        operation: "subscribe" | "unsubscribe"
      ) {
        const subscriber = subscriberOf(principal);
        if (Result.isFailure(subscriber)) {
          return subscriber.failure;
        }
        const params = rpc.params ?? {};
        return yield* (
          operation === "subscribe"
            ? events.subscribe(subscriber.success, params)
            : events.unsubscribe(subscriber.success, params).pipe(Effect.as({}))
        ).pipe(
          Effect.map(ok),
          Effect.catchTag("McpEventsError", (error) =>
            Effect.succeed(fail(error.code, error.message, error.data))
          )
        );
      });

      /** Methods both eras share. */
      const shared = (
        principal: Principal,
        rpc: JsonRpcRequest
      ): Effect.Effect<Reply | null, never, RequestId> => {
        switch (rpc.method) {
          case "ping": {
            return Effect.succeed(ok({}));
          }
          case "tools/list": {
            return Effect.succeed(ok({ tools: listed(principal) }));
          }
          case "tools/call": {
            return callTool(principal, rpc);
          }
          default: {
            return Effect.succeed(null);
          }
        }
      };

      const legacy = Effect.fn("McpServer.legacy")(function* (
        principal: Principal,
        rpc: JsonRpcRequest
      ) {
        if (rpc.method === "initialize") {
          const requested = rpc.params?.protocolVersion;
          const version =
            PROTOCOL_VERSIONS.find((candidate) => candidate === requested) ??
            "2025-06-18";
          return ok({
            capabilities: { tools: { listChanged: false } },
            instructions: INSTRUCTIONS,
            protocolVersion: version,
            serverInfo: SERVER_INFO,
          });
        }
        return (
          (yield* shared(principal, rpc)) ??
          fail(-32_601, `Method not found: ${rpc.method}`)
        );
      });

      /** The methods only MCP 2.0 has: discovery and MCP Events. */
      const modernOnly = (
        principal: Principal,
        rpc: JsonRpcRequest
      ): Effect.Effect<Reply | null, InfrastructureError> => {
        switch (rpc.method) {
          case "server/discover": {
            return Effect.succeed(
              ok({
                _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
                capabilities: { events: {}, tools: {} },
                instructions: DISCOVER_INSTRUCTIONS,
                supportedVersions: SUPPORTED_VERSIONS,
              })
            );
          }
          case "events/list": {
            return Effect.succeed(
              ok({
                events: Result.isSuccess(subscriberOf(principal))
                  ? EVENT_DEFINITIONS
                  : [],
              })
            );
          }
          case "events/subscribe": {
            return eventsCall(principal, rpc, "subscribe");
          }
          case "events/unsubscribe": {
            return eventsCall(principal, rpc, "unsubscribe");
          }
          default: {
            return Effect.succeed(null);
          }
        }
      };

      const modern = Effect.fn("McpServer.modern")(function* (
        request: HttpServerRequest.HttpServerRequest,
        principal: Principal,
        rpc: JsonRpcRequest
      ) {
        const metaVersion = metaVersionOf(rpc.params);
        const headerVersion = header(request, "mcp-protocol-version");
        if (metaVersion === undefined || headerVersion !== metaVersion) {
          return headerMismatch(
            `MCP-Protocol-Version header (${headerVersion ?? "missing"}) must match params._meta["${META_VERSION}"] (${metaVersion ?? "missing"})`
          );
        }
        if (metaVersion !== MODERN_VERSION) {
          return fail(
            -32_022,
            "Unsupported protocol version",
            { requested: metaVersion, supported: SUPPORTED_VERSIONS },
            400
          );
        }
        const method = header(request, "mcp-method");
        if (method !== rpc.method) {
          return headerMismatch(
            `Mcp-Method header (${method ?? "missing"}) must match the body method (${rpc.method})`
          );
        }
        if (rpc.method === "tools/call") {
          const name = headerValue(header(request, "mcp-name"));
          if (name !== rpc.params?.name) {
            return headerMismatch(
              `Mcp-Name header (${name ?? "missing"}) must match params.name`
            );
          }
        }
        return (
          (yield* modernOnly(principal, rpc)) ??
          (yield* shared(principal, rpc)) ??
          fail(-32_601, `Method not found: ${rpc.method}`, undefined, 404)
        );
      });

      const resourceMetadata = `${config.apiUrl}/.well-known/oauth-protected-resource/mcp`;
      /** RFC 9728 / RFC 6750 challenge that points clients at OAuth discovery. */
      const challenge = (error?: {
        readonly code: "invalid_token" | "insufficient_scope";
        readonly description: string;
      }) =>
        [
          'Bearer realm="EmitKit"',
          `resource_metadata="${resourceMetadata}"`,
          `scope="${MCP_SCOPE}"`,
          ...(error
            ? [
                `error="${error.code}"`,
                `error_description="${error.description}"`,
              ]
            : []),
        ].join(", ");

      /**
       * An OAuth access token as a principal: a live grant, with every
       * scope (only owners and admins can grant, and a grant does what an
       * API key does). Otherwise the HTTP response refusing it.
       */
      const tokenPrincipal = Effect.fn("McpServer.tokenPrincipal")(function* (
        token: string,
        requestId: string
      ): Effect.fn.Return<
        Result.Result<Principal, HttpServerResponse.HttpServerResponse>,
        InfrastructureError
      > {
        const claims = yield* auth.verifyAccessToken(token);
        const verdict = claims
          ? yield* grants.resolve(claims)
          : ({ _tag: "InvalidToken" } satisfies GrantVerdict);
        switch (verdict._tag) {
          case "Granted": {
            const { grant, rateLimit } = verdict;
            return Result.succeed({
              credentialId: grant.id,
              organizationId: grant.organizationId,
              projectId: grant.projectId,
              rateLimit,
              scopes: ALL_SCOPES,
              via: "oauth",
            });
          }
          case "InsufficientScope": {
            const description = `The token needs the ${MCP_SCOPE} scope`;
            return refused(
              403,
              {
                code: "insufficient_scope",
                error: "Forbidden",
                message: description,
                requestId,
                success: false,
              },
              {
                "WWW-Authenticate": challenge({
                  code: "insufficient_scope",
                  description,
                }),
              }
            );
          }
          case "RateLimited": {
            return refused(
              429,
              {
                code: "rate_limited",
                error: "Rate limit exceeded",
                message: "Too many requests. Please try again later.",
                requestId,
                success: false,
              },
              {
                ...rateLimitHeaders(verdict.rateLimit),
                "Retry-After": String(verdict.retryAfterSeconds),
              }
            );
          }
          default: {
            const description =
              "The access token is invalid or expired, or access was revoked";
            return refused(
              401,
              {
                code: "unauthorized",
                error: "Unauthorized",
                message: description,
                requestId,
                success: false,
              },
              {
                "WWW-Authenticate": challenge({
                  code: "invalid_token",
                  description,
                }),
              }
            );
          }
        }
      });

      /** An API key as a principal, as the public API resolves it; a 401 points at OAuth too. */
      const keyPrincipal = (secret: string) =>
        api.authenticate(secret).pipe(
          Effect.map(
            Result.mapError(({ body, headers, status }) =>
              json(
                status,
                body,
                status === 401
                  ? {
                      ...headers,
                      "WWW-Authenticate": challenge({
                        code: "invalid_token",
                        description: "The API key is invalid",
                      }),
                    }
                  : headers
              )
            )
          )
        );

      const handle: Endpoint = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const requestId = yield* RequestId;
        if (request.method !== "POST") {
          return json(
            405,
            {
              code: "method_not_allowed",
              error: "Use POST for MCP requests",
              requestId,
              success: false,
            },
            { Allow: "POST" }
          );
        }
        const secret = credential(request);
        if (secret === null) {
          return json(
            401,
            {
              code: "unauthorized",
              error: "Unauthorized",
              message:
                "Connect with OAuth, or send your EmitKit API key as Authorization: Bearer emitkit_…",
              requestId,
              success: false,
            },
            { "WWW-Authenticate": challenge() }
          );
        }
        const parsed = decodeJsonRpcRequest(yield* request.text);
        if (Option.isNone(parsed)) {
          return respond(
            null,
            fail(-32_700, "Parse error: expected one JSON-RPC 2.0 request"),
            false
          );
        }
        const rpc = parsed.value;
        // A notification: nothing to answer, so nothing to authenticate.
        if (rpc.id === undefined) {
          return HttpServerResponse.empty({ status: 202 });
        }
        // Once per request, for every method: an invalid or rate-limited
        // credential is an HTTP error, as MCP clients expect. API keys keep
        // their own path; any other credential is an OAuth access token.
        const authorize: Effect.Effect<
          Result.Result<Principal, HttpServerResponse.HttpServerResponse>,
          InfrastructureError,
          RequestId
        > = secret.startsWith(API_KEY_PREFIX)
          ? keyPrincipal(secret)
          : tokenPrincipal(secret, requestId);
        const verified = yield* authorize.pipe(
          Effect.catchTag("InfrastructureError", (error) =>
            Effect.logError(
              "MCP credential check failed",
              describeFailure(error)
            ).pipe(
              Effect.as(
                Result.fail(
                  json(500, {
                    code: "internal_error",
                    error: "Internal error",
                    requestId,
                    success: false,
                  })
                )
              )
            )
          )
        );
        if (Result.isFailure(verified)) {
          return verified.failure;
        }
        const principal = verified.success;
        const metaVersion = metaVersionOf(rpc.params);
        const headerVersion = header(request, "mcp-protocol-version");
        const isModern =
          (metaVersion !== undefined &&
            !PROTOCOL_VERSIONS.includes(metaVersion)) ||
          (headerVersion !== undefined &&
            !PROTOCOL_VERSIONS.includes(headerVersion));
        const reply = yield* (
          isModern ? modern(request, principal, rpc) : legacy(principal, rpc)
        ).pipe(
          Effect.catchTag("InfrastructureError", (error) =>
            Effect.logError("MCP request failed", describeFailure(error)).pipe(
              Effect.as(fail(-32_603, "Internal error"))
            )
          )
        );
        return respond(rpc.id, reply, isModern);
      });

      return McpServer.of({ handle });
    })
  );
}
