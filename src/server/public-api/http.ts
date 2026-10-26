import type { RateLimitState } from "@server/platform/auth";
import { stringifyJson } from "@server/platform/json";
import { Context, Option } from "effect";
import type { Effect, Schema } from "effect";
import { Headers, HttpServerResponse } from "effect/unstable/http";
import type { HttpServerError, HttpServerRequest } from "effect/unstable/http";

export const MAX_BODY_BYTES = 1024 * 1024;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** Correlates a request with its response: echoed in JSON bodies and `X-Request-ID`. */
export class RequestId extends Context.Service<RequestId, string>()(
  "emitkit/public-api/RequestId"
) {}

/** A public API or MCP endpoint, run against the current request. */
export type Endpoint = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest | RequestId
>;

export const rateLimitHeaders = (
  rateLimit: RateLimitState | null
): Record<string, string> =>
  rateLimit
    ? {
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.resetAtSeconds),
      }
    : {};

export const json = (
  status: number,
  payload: Schema.Json,
  headers: Readonly<Record<string, string>> = {}
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.text(stringifyJson(payload), {
    contentType: JSON_CONTENT_TYPE,
    headers,
    status,
  });

/** A request header's trimmed value (possibly empty), or undefined when absent. */
export const header = (
  request: HttpServerRequest.HttpServerRequest,
  name: string
): string | undefined =>
  Headers.get(request.headers, name).pipe(
    Option.map((value) => value.trim()),
    Option.getOrUndefined
  );

/**
 * The API key of a request: `Authorization: Bearer <key>` or `X-API-Key: <key>`
 * (they must agree when both are sent). Null when missing, empty or ambiguous.
 */
export const credential = (
  request: HttpServerRequest.HttpServerRequest
): string | null => {
  const authorization = header(request, "authorization") ?? "";
  const bearer =
    /^Bearer\s+(?<token>\S+)$/iu.exec(authorization)?.groups?.token ?? null;
  const apiKey = header(request, "x-api-key") || null;
  if (bearer && apiKey && bearer !== apiKey) {
    return null;
  }
  return bearer ?? apiKey;
};
