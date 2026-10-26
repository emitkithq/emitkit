import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { CloudflareEnv } from "@server/platform/cloudflare";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer, Redacted } from "effect";

/**
 * Workers Analytics Engine: the `EVENTS_DATASET` write binding plus the SQL
 * API (reads need an account API token with Account Analytics Read).
 */
export class AnalyticsEngine extends Context.Service<
  AnalyticsEngine,
  {
    readonly dataset: string;
    readonly write: (
      point: AnalyticsEngineDataPoint
    ) => Effect.Effect<void, InfrastructureError>;
    /** Runs one SQL statement and returns the raw `FORMAT JSON` body. */
    readonly sql: (
      statement: string
    ) => Effect.Effect<string, InfrastructureError>;
  }
>()("emitkit/platform/AnalyticsEngine") {
  static readonly layer = Layer.effect(
    AnalyticsEngine,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const config = yield* AppConfig;
      const { accountId, dataset, token } = config.analytics;
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId ?? ""}/analytics_engine/sql`;

      const write = Effect.fn("AnalyticsEngine.write")(function* (
        point: AnalyticsEngineDataPoint
      ) {
        yield* Effect.try({
          catch: infrastructure("analytics-engine.write"),
          try: () => env.EVENTS_DATASET.writeDataPoint(point),
        });
      });

      const sql = Effect.fn("AnalyticsEngine.sql")(function* (
        statement: string
      ) {
        const response = yield* Effect.tryPromise({
          catch: infrastructure("analytics-engine.sql"),
          try: (signal) =>
            fetch(endpoint, {
              body: `${statement} FORMAT JSON`,
              headers: {
                authorization: `Bearer ${token ? Redacted.value(token) : ""}`,
              },
              method: "POST",
              signal,
            }),
        });
        const text = yield* Effect.tryPromise({
          catch: infrastructure("analytics-engine.sql"),
          try: () => response.text(),
        });
        if (!response.ok) {
          return yield* infrastructure("analytics-engine.sql")(
            `Analytics Engine SQL answered ${response.status}: ${text.slice(0, 300)}`
          );
        }
        return text;
      });

      return AnalyticsEngine.of({ dataset, sql, write });
    })
  );
}
