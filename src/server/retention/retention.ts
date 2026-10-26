import { Cards } from "@server/cards/cards";
import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { EventStore, RETENTION_DAYS } from "@server/events/event-store";
import { Events } from "@server/events/events";
import { Idempotency } from "@server/idempotency/idempotency";
import { Identities } from "@server/identities/identities";
import { Projects } from "@server/projects/projects";
import { Clock, Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

const DAY_MS = 86_400_000;
const IDENTITY_INACTIVITY_DAYS = 180;

const isoDaysAgo = (nowMs: number, days: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(nowMs - days * DAY_MS));

/**
 * Hourly housekeeping (cron). Events in Analytics Engine expire on their own
 * after ~90 days; everything else with a lifetime is swept here.
 */
export class Retention extends Context.Service<
  Retention,
  { readonly sweep: Effect.Effect<Record<string, number>, InfrastructureError> }
>()("emitkit/retention/Retention") {
  static readonly layer = Layer.effect(
    Retention,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = yield* EventStore;
      const events = yield* Events;
      const identities = yield* Identities;
      const idempotency = yield* Idempotency;
      const projects = yield* Projects;
      const cards = yield* Cards;

      const runSweep = Effect.fn("Retention.sweep")(function* () {
        const nowMs = yield* Clock.currentTimeMillis;
        const eventCutoff = isoDaysAgo(nowMs, RETENTION_DAYS + 1);
        const [
          expiredEvents,
          tombstones,
          receipts,
          expiredIdentities,
          purgedProjects,
          expiredCards,
        ] = yield* Effect.all(
          [
            store.expire(nowMs),
            events.expireTombstones(eventCutoff),
            idempotency.expire(nowMs),
            identities.expire(isoDaysAgo(nowMs, IDENTITY_INACTIVITY_DAYS)),
            projects.purgeDeleted(isoDaysAgo(nowMs, RETENTION_DAYS)),
            cards.expire(nowMs - RETENTION_DAYS * DAY_MS),
          ],
          { concurrency: 1 }
        );
        const orphanKeys = yield* sql<{ readonly id: string }>`
          delete from apikey
          where json_extract(metadata, '$.projectId') is not null
            and json_extract(metadata, '$.projectId') not in (select id from project)
          returning id
        `.pipe(Effect.mapError(infrastructure("retention.apiKeys")));
        const summary = {
          apiKeys: orphanKeys.length,
          cards: expiredCards,
          events: expiredEvents,
          identities: expiredIdentities,
          idempotencyReceipts: receipts,
          projects: purgedProjects,
          tombstones,
        };
        yield* Effect.logInfo("retention sweep", summary);
        return summary;
      });

      return Retention.of({ sweep: runSweep() });
    })
  );
}
