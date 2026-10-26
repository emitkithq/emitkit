import type { Env } from "@server/platform/env";
import { Context, Layer } from "effect";

/** The Worker's bindings and variables, provided once per isolate. */
export class CloudflareEnv extends Context.Service<CloudflareEnv, Env>()(
  "emitkit/platform/CloudflareEnv"
) {
  static readonly layer = (env: Env) => Layer.succeed(CloudflareEnv, env);
}
