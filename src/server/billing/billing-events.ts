import { Billing } from "@server/billing/billing";
import {
  billingTelemetry,
  changedPlan,
  PlanChange,
} from "@server/billing/billing-telemetry";
import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Notifications } from "@server/notifications/notifications";
import { Memberships } from "@server/organizations/memberships";
import { AppConfig } from "@server/platform/config";
import { Telemetry } from "@server/platform/telemetry";
import { verifySvixSignature } from "@server/platform/webhook-signature";
import { ownerActor } from "@server/telemetry/actors";
import { plans } from "@shared/billing";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

const BillingUpdated = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Struct({
      customer_id: Schema.String,
      plan_changes: Schema.optional(Schema.Array(PlanChange)),
      tags: Schema.optional(Schema.Array(Schema.String)),
    }),
    type: Schema.String,
  })
);

export type WebhookOutcome = "accepted" | "ignored" | "unauthorized";

interface Notice {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
}

const planName = (change: PlanChange | undefined) => {
  const id = changedPlan(change);
  return id ? plans[id].name : "your plan";
};

/**
 * What to tell the organization about one `billing.updated` event, if
 * anything: a failed payment, a plan that ended, or a trial that turned
 * into a paid plan. New plans get no push; whoever bought one is looking.
 */
const noticeFor = (
  changes: readonly PlanChange[],
  tags: readonly string[]
): Notice | null => {
  const ours = changes.filter((change) => changedPlan(change) !== null);
  const pastDue = ours.find(
    (change) =>
      change.subscription?.past_due === true &&
      change.previous_attributes?.past_due !== true
  );
  if (pastDue) {
    return {
      body: `We couldn't charge your card for EmitKit ${planName(pastDue)}. Update your payment method to keep push notifications on.`,
      tag: "emitkit-billing-payment",
      title: "💳 Payment failed",
    };
  }
  const activated = ours.some((change) => change.action === "activated");
  const expired = ours.find((change) => change.action === "expired");
  if (expired && !activated) {
    return {
      body: `Your EmitKit ${planName(expired)} plan ended, so push notifications are paused. Events are still recorded. Pick a plan to turn pushes back on.`,
      tag: "emitkit-billing-ended",
      title: "⏸️ Your plan ended",
    };
  }
  if (tags.includes("trial_ended")) {
    const plan = ours.find((change) => change.action !== "expired");
    return {
      body: `Your trial is over and ${planName(plan)} is active. Thanks for using EmitKit!`,
      tag: "emitkit-billing-trial",
      title: "✅ Trial ended",
    };
  }
  return null;
};

/**
 * Autumn's webhook (`POST /api/billing/webhook` on the app host): verifies
 * the Svix signature, refreshes the organization's cached billing state,
 * pushes a billing notice to its own devices (EmitKit notifying you about
 * EmitKit, through the same pipeline your events use), and reports the
 * change to the operator's telemetry.
 */
export class BillingEvents extends Context.Service<
  BillingEvents,
  {
    readonly receive: (
      headers: Headers,
      body: string
    ) => Effect.Effect<WebhookOutcome, InfrastructureError>;
  }
>()("emitkit/billing/BillingEvents") {
  static readonly layer = Layer.effect(
    BillingEvents,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const billing = yield* Billing;
      const notifications = yield* Notifications;
      const memberships = yield* Memberships;
      const telemetry = yield* Telemetry;
      const sql = yield* SqlClient.SqlClient;

      const report = Effect.fn("BillingEvents.report")(function* (
        organizationId: string,
        changes: readonly PlanChange[],
        tags: readonly string[]
      ) {
        const [owner, status, nowMs] = yield* Effect.all([
          memberships.owner(organizationId),
          billing.status(organizationId),
          Clock.currentTimeMillis,
        ]);
        const events = billingTelemetry({
          changes,
          nowMs,
          organizationId,
          owner,
          seats: status.seats,
          tags,
        });
        yield* Effect.forEach(
          events,
          (event) =>
            telemetry.track(event.name, event.properties, ownerActor(owner)),
          { discard: true }
        );
      });

      const receive = Effect.fn("BillingEvents.receive")(function* (
        headers: Headers,
        body: string
      ) {
        const secret = config.billing?.webhookSecret;
        if (!secret) {
          return "ignored" satisfies WebhookOutcome;
        }
        if (!(yield* verifySvixSignature(secret, headers, body))) {
          return "unauthorized" satisfies WebhookOutcome;
        }
        const decoded = Schema.decodeUnknownOption(BillingUpdated)(body);
        if (
          Option.isNone(decoded) ||
          decoded.value.type !== "billing.updated"
        ) {
          return "ignored" satisfies WebhookOutcome;
        }
        const organizationId = decoded.value.data.customer_id;
        const known = yield* sql<{ readonly id: string }>`
          select id from organization where id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("billing.webhook.organization")));
        if (known.length === 0) {
          return "ignored" satisfies WebhookOutcome;
        }
        yield* billing.refresh(organizationId);
        const changes = decoded.value.data.plan_changes ?? [];
        const tags = decoded.value.data.tags ?? [];
        const notice = noticeFor(changes, tags);
        if (notice) {
          const delivered = yield* notifications.announce(
            organizationId,
            { ...notice, path: "?settings=billing" },
            config.appUrl
          );
          yield* Effect.logInfo("billing notice", {
            delivered,
            organizationId,
            tag: notice.tag,
          });
        }
        // Last, so a failure above (which Autumn retries) hasn't reported the
        // change yet; delivery runs after the response.
        yield* telemetry.background(
          "billing telemetry",
          report(organizationId, changes, tags)
        );
        return "accepted" satisfies WebhookOutcome;
      });

      return BillingEvents.of({ receive });
    })
  );
}
