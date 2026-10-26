import { D1Client } from "@effect/sql-d1";
import { CloudflareEnv } from "@server/platform/cloudflare";
import { Effect, Layer } from "effect";

/** Effect SQL client (`SqlClient` + `D1Client`) over the `DB` binding. */
export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* CloudflareEnv;
    return D1Client.layer({ db: env.DB });
  })
);
