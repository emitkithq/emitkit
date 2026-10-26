import openapiDocument from "@openapi/openapi.json?raw";
import { McpServer } from "@server/mcp/mcp";
import { AppConfig } from "@server/platform/config";
import { makeRequestId } from "@server/platform/ids";
import {
  credential,
  header,
  json,
  MAX_BODY_BYTES,
  RequestId,
} from "@server/public-api/http";
import { PublicApi } from "@server/public-api/public-api";
import type { Invoke } from "@server/public-api/public-api";
import { Cause, Context, Effect, Layer } from "effect";
import type { Scope } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

/**
 * Paths match exactly as published: case-sensitive, no trailing- or
 * duplicate-slash folding. `user_id` has no length limit in the contract,
 * so path parameters may be long.
 */
const ROUTER_CONFIG = {
  caseSensitive: true,
  ignoreDuplicateSlashes: false,
  ignoreTrailingSlash: false,
  maxParamLength: 8192,
};

const openapi = HttpServerResponse.text(openapiDocument, {
  contentType: "application/json; charset=utf-8",
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  },
});

/** Serves an operation over REST: the request's API key, body, `Idempotency-Key` and path parameters. */
const rest = (invoke: Invoke) =>
  Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
    const reply = yield* invoke({
      body: yield* request.text,
      credential: credential(request),
      idempotencyKey: header(request, "idempotency-key"),
      params: yield* HttpRouter.params,
    });
    return json(reply.status, reply.body, reply.headers);
  });

/** Serves a read over REST: its query parameters are the operation's input. */
const query = (invoke: Invoke) =>
  Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
    const url = new URL(request.url, "http://api");
    const reply = yield* invoke({
      credential: credential(request),
      params: Object.fromEntries(url.searchParams),
    });
    return json(reply.status, reply.body, reply.headers);
  });

/**
 * Every route on the API host. `/api/v1/*` and `/api/openapi.json` (also on
 * the app host) are rewritten to these paths by `src/worker/router.ts`.
 */
const Routes = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const api = yield* PublicApi;
    const mcp = yield* McpServer;
    const { docsUrl } = yield* AppConfig;
    const health = json(200, {
      docs: docsUrl,
      name: "EmitKit API",
      openapi: "/openapi.json",
      status: "ok",
    });
    yield* router.addAll([
      HttpRouter.route("GET", "/", health),
      HttpRouter.route("GET", "/health", health),
      HttpRouter.route("GET", "/openapi.json", openapi),
      HttpRouter.route("*", "/mcp", mcp.handle),
      HttpRouter.route("GET", "/v1/me", query(api.me)),
      HttpRouter.route("POST", "/v1/events", rest(api.createEvent)),
      HttpRouter.route("GET", "/v1/events", query(api.listEvents)),
      HttpRouter.route("GET", "/v1/events/:id", rest(api.getEvent)),
      HttpRouter.route("POST", "/v1/events/:id/cancel", rest(api.cancelEvent)),
      HttpRouter.route("GET", "/v1/channels", query(api.listChannels)),
      HttpRouter.route("POST", "/v1/identify", rest(api.identify)),
      HttpRouter.route(
        "DELETE",
        "/v1/identities/:user_id",
        rest(api.deleteIdentity)
      ),
    ]);
  })
);

const encoder = new TextEncoder();

/** UTF-8 takes 1 to 3 bytes per UTF-16 code unit, so only bodies in between need encoding. */
const withinBodyLimit = (text: string) =>
  text.length * 3 <= MAX_BODY_BYTES ||
  (text.length <= MAX_BODY_BYTES &&
    encoder.encode(text).byteLength <= MAX_BODY_BYTES);

/**
 * The public API and MCP as one Effect HTTP handler. Around the router it
 * assigns the request id (body and `X-Request-ID`), rejects bodies over
 * 1 MiB before routing or authentication, and answers unknown routes and
 * unexpected failures with the contract's JSON bodies.
 */
export class PublicHttp extends Context.Service<
  PublicHttp,
  {
    readonly handler: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      HttpServerRequest.HttpServerRequest | Scope.Scope
    >;
  }
>()("emitkit/public-api/PublicHttp") {
  static readonly layer = Layer.effect(
    PublicHttp,
    Effect.gen(function* () {
      const routes = yield* HttpRouter.toHttpEffect(Routes).pipe(
        Effect.provideService(HttpRouter.RouterConfig, ROUTER_CONFIG)
      );

      const withinLimit = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (Number(header(request, "content-length") ?? 0) > MAX_BODY_BYTES) {
          return false;
        }
        if (request.method === "GET" || request.method === "HEAD") {
          return true;
        }
        // Reads (and caches) the body, so endpoints see the same text.
        return withinBodyLimit(yield* request.text);
      });

      const handler = Effect.gen(function* () {
        const requestId = yield* makeRequestId;
        const response = yield* Effect.gen(function* () {
          if (!(yield* withinLimit)) {
            return json(413, {
              code: "payload_too_large",
              error: "Payload too large",
              message: "Request body exceeds the 1 MiB limit",
              requestId,
              success: false,
            });
          }
          return yield* routes;
        }).pipe(
          Effect.catchTag("HttpServerError", (error) =>
            error.reason._tag === "RouteNotFound"
              ? Effect.succeed(
                  json(404, {
                    code: "not_found",
                    error: "Not found",
                    requestId,
                    success: false,
                  })
                )
              : Effect.die(error)
          ),
          Effect.catchCause((cause) =>
            Effect.logError(
              "public API request failed",
              Cause.pretty(cause)
            ).pipe(
              Effect.as(
                json(500, {
                  code: "internal_error",
                  error: "Internal error",
                  requestId,
                  success: false,
                })
              )
            )
          ),
          Effect.provideService(RequestId, requestId)
        );
        return HttpServerResponse.setHeader(
          response,
          "X-Request-ID",
          requestId
        );
      });

      return PublicHttp.of({ handler });
    })
  );
}
