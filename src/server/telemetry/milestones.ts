import { infrastructure } from "@server/errors";
import { Memberships } from "@server/organizations/memberships";
import { Telemetry } from "@server/platform/telemetry";
import { ownerActor } from "@server/telemetry/actors";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** Event counts worth a push, after the first event. */
const THRESHOLDS: ReadonlySet<number> = new Set([
  100, 1000, 10_000, 100_000, 1_000_000,
]);

const count = new Intl.NumberFormat("en-US");

/**
 * Usage milestones for telemetry: an organization's first event through the
 * public API or MCP, then 100, 1,000, … events. Counted in
 * `organization_usage` only while telemetry is on, after the response, so
 * ingestion gets no slower and self-hosted deployments write nothing. The
 * migration seeds organizations that already had events; one that sends
 * events while telemetry is off is counted from zero once it's turned on.
 */
export class Milestones extends Context.Service<
  Milestones,
  {
    /** One event was accepted for the organization. Never fails. */
    readonly eventAccepted: (organizationId: string) => Effect.Effect<void>;
  }
>()("emitkit/telemetry/Milestones") {
  static readonly layer = Layer.effect(
    Milestones,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const memberships = yield* Memberships;
      const telemetry = yield* Telemetry;

      /** Adds one event and returns the new total, exactly once per total. */
      const increment = (organizationId: string) =>
        sql<{ readonly events: number }>`
          insert into organization_usage (organization_id, events) values (${organizationId}, 1)
          on conflict (organization_id) do update set events = events + 1
          returning events
        `.pipe(
          Effect.map((rows) => rows[0]?.events ?? 0),
          Effect.mapError(infrastructure("milestones.increment"))
        );

      const record = Effect.fn("Milestones.record")(function* (
        organizationId: string
      ) {
        const events = yield* increment(organizationId);
        if (events !== 1 && !THRESHOLDS.has(events)) {
          return;
        }
        const owner = yield* memberships.owner(organizationId);
        if (!owner) {
          return;
        }
        const scope = {
          organizationId,
          organizationName: owner.organizationName,
        };
        yield* events === 1
          ? telemetry.track(
              "first_event_received",
              {
                ...scope,
                description: `${owner.organizationName} sent its first event.`,
              },
              ownerActor(owner)
            )
          : telemetry.track(
              "milestone_reached",
              {
                ...scope,
                description: `${owner.organizationName} has sent ${count.format(events)} events.`,
                events,
              },
              ownerActor(owner)
            );
      });

      const eventAccepted = (organizationId: string) =>
        telemetry.enabled
          ? telemetry.background(
              "milestones.eventAccepted",
              record(organizationId)
            )
          : Effect.void;

      return Milestones.of({ eventAccepted });
    })
  );
}
