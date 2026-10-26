import { stringifyJson } from "@server/platform/json";
import { credential, json, RequestId } from "@server/public-api/http";
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
import type { Scope } from "@shared/scopes";
import { Context, Effect, Layer, Option, Result, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

const PROTOCOL_VERSIONS: readonly string[] = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

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
        title: tool.title,
      })),
  };
};

const rpcResult = (id: JsonRpcRequest["id"], result: Schema.JsonObject) =>
  json(200, { id: id ?? null, jsonrpc: "2.0", result });
const rpcError = (
  id: JsonRpcRequest["id"] | null,
  code: number,
  message: string
) => json(200, { error: { code, message }, id: id ?? null, jsonrpc: "2.0" });

/**
 * Model Context Protocol endpoint (`/mcp` on the API host): stateless
 * Streamable HTTP with JSON responses and API-key auth. Each request
 * authenticates once (a bad key is an HTTP 401, a spent rate limit a 429)
 * and counts once against the key's rate limit. Tool calls run the public
 * API operations for that principal, so they answer with REST's bodies.
 */
export class McpServer extends Context.Service<
  McpServer,
  { readonly handle: Endpoint }
>()("emitkit/mcp/McpServer") {
  static readonly layer = Layer.effect(
    McpServer,
    Effect.gen(function* () {
      const api = yield* PublicApi;

      const { byName, listed } = tools(api);

      const callTool = Effect.fn("McpServer.callTool")(function* (
        principal: Principal,
        rpc: JsonRpcRequest
      ) {
        const call = decodeToolCall(rpc.params);
        if (Option.isNone(call)) {
          return rpcError(rpc.id, -32_602, "Invalid tool call parameters");
        }
        const { name } = call.value;
        const tool = byName.get(name);
        if (!tool) {
          const names = listed(principal).map((listing) => listing.name);
          return rpcError(
            rpc.id,
            -32_602,
            `Unknown tool: ${name}. Tools: ${names.join(", ")}`
          );
        }
        const { body, status } = yield* tool.call(
          call.value.arguments ?? {},
          principal
        );
        return rpcResult(rpc.id, {
          content: [{ text: stringifyJson(body), type: "text" }],
          isError: status >= 400,
          structuredContent: body,
        });
      });

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
                "Send your EmitKit API key as Authorization: Bearer emitkit_…",
              requestId,
              success: false,
            },
            { "WWW-Authenticate": 'Bearer realm="EmitKit"' }
          );
        }
        const parsed = decodeJsonRpcRequest(yield* request.text);
        if (Option.isNone(parsed)) {
          return rpcError(
            null,
            -32_700,
            "Parse error: expected one JSON-RPC 2.0 request"
          );
        }
        const rpc = parsed.value;
        // A notification: nothing to answer, so nothing to authenticate.
        if (rpc.id === undefined) {
          return HttpServerResponse.empty({ status: 202 });
        }
        // Once per request, for every method: an invalid or rate-limited
        // credential is an HTTP error, as MCP clients expect.
        const verified = yield* api.authenticate(secret);
        if (Result.isFailure(verified)) {
          const { body, headers, status } = verified.failure;
          return json(status, body, headers);
        }
        const principal = verified.success;
        switch (rpc.method) {
          case "initialize": {
            const requested = rpc.params?.protocolVersion;
            const version =
              PROTOCOL_VERSIONS.find((candidate) => candidate === requested) ??
              "2025-06-18";
            return rpcResult(rpc.id, {
              capabilities: { tools: { listChanged: false } },
              instructions:
                "Send events to the project bound to your API key, and ask people for decisions: an event with buttons or fields waits for an answer on their phone (read it with getEvent). Also lists recent events and channels, and manages identities.",
              protocolVersion: version,
              serverInfo: {
                name: "emitkit",
                title: "EmitKit",
                version: "3.0.0",
              },
            });
          }
          case "ping": {
            return rpcResult(rpc.id, {});
          }
          case "tools/list": {
            return rpcResult(rpc.id, { tools: listed(principal) });
          }
          case "tools/call": {
            return yield* callTool(principal, rpc);
          }
          default: {
            return rpcError(rpc.id, -32_601, `Method not found: ${rpc.method}`);
          }
        }
      });

      return McpServer.of({ handle });
    })
  );
}
