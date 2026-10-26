import type { AppServices } from "@server/app-layer";
import type { Env } from "@server/platform/env";
import { PublicHttp } from "@server/public-api/router";
import { internalError } from "@worker/http";
import { appRuntime } from "@worker/runtime";
import { Context } from "effect";
import type { Scope } from "effect";
import { HttpEffect } from "effect/unstable/http";
import type { HttpServerRequest } from "effect/unstable/http";

type WebHandler = (request: Request) => Promise<Response>;

interface Cached {
  readonly runtime: object;
  readonly handler: WebHandler;
}

let cached: Cached | undefined;

const webHandler = async (env: Env): Promise<WebHandler> => {
  const runtime = await appRuntime(env);
  if (cached?.runtime === runtime) {
    return cached.handler;
  }
  const context = await runtime.context();
  const handler = HttpEffect.toWebHandlerWith<
    AppServices,
    HttpServerRequest.HttpServerRequest | Scope.Scope
  >(context)(Context.get(context, PublicHttp).handler);
  cached = { handler, runtime };
  return handler;
};

/**
 * Public REST API and MCP (api host, plus `/api/v1/*` on the app host):
 * hands the request to the `PublicHttp` Effect handler, run with the
 * isolate's app services.
 */
export const handlePublicApi = async (request: Request, env: Env) => {
  try {
    const handler = await webHandler(env);
    return await handler(request);
  } catch (error) {
    return internalError(error);
  }
};
