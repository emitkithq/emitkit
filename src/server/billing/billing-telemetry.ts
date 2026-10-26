import type { OrganizationOwner } from "@server/organizations/memberships";
import type {
  Revenue,
  TelemetryEventName,
  TelemetryProperties,
} from "@server/telemetry/events";
import { isPlanId, plans } from "@shared/billing";
import type { PlanBilling, PlanId, PlanInfo } from "@shared/billing";
import { DateTime, Schema } from "effect";

const Timestamp = Schema.optional(Schema.NullOr(Schema.Number));

/** One `plan_changes` entry of Autumn's `billing.updated` webhook. */
export const PlanChange = Schema.Struct({
  action: Schema.String,
  /** The fields that changed, with their old values (only those read here). */
  previous_attributes: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        canceled_at: Schema.optional(Schema.Unknown),
        past_due: Schema.optional(Schema.Unknown),
      })
    )
  ),
  purchase: Schema.optional(
    Schema.NullOr(Schema.Struct({ plan_id: Schema.String }))
  ),
  subscription: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        canceled_at: Timestamp,
        current_period_end: Timestamp,
        expires_at: Timestamp,
        past_due: Schema.optional(Schema.Boolean),
        plan_id: Schema.String,
        trial_ends_at: Timestamp,
      })
    )
  ),
});

export type PlanChange = typeof PlanChange.Type;

/** The priced plan a change is about, if it's one of ours (not `comp`). */
export const changedPlan = (change: PlanChange | undefined): PlanId | null => {
  const id = change?.subscription?.plan_id ?? change?.purchase?.plan_id;
  return isPlanId(id) ? id : null;
};

export type BillingTelemetry = {
  readonly [Name in TelemetryEventName]: {
    readonly name: Name;
    readonly properties: TelemetryProperties[Name];
  };
}[TelemetryEventName];

/**
 * What a plan charges per period at `seats`: its price plus extra seats.
 * Lifetime plans are their list price in `src/shared/billing.ts`, which is
 * only the Solo Lifetime ladder's current step if it's bumped with Autumn's.
 */
const planAmount = (plan: PlanInfo, seats: number) =>
  plan.price + Math.max(0, seats - plan.seats) * (plan.extraSeatPrice ?? 0);

const charge = (amount: number): Revenue => ({ amount, currency: "USD" });

const PER = {
  lifetime: "",
  month: "/mo",
  year: "/yr",
} satisfies Record<PlanBilling, string>;

const priceLabel = (plan: PlanInfo, amount: number) =>
  `$${amount}${PER[plan.billing]}`;

/** "Solo monthly", "Team yearly", "Team Lifetime". */
const planLabel = (plan: PlanInfo) =>
  plan.billing === "lifetime"
    ? plan.name
    : `${plan.name} ${plan.billing === "month" ? "monthly" : "yearly"}`;

const isoFromMs = (ms: number | null | undefined) =>
  ms === null || ms === undefined
    ? null
    : DateTime.formatIso(DateTime.makeUnsafe(ms));

const planScope = (
  organizationId: string,
  owner: OrganizationOwner | null,
  planId: PlanId
) => ({
  billing: plans[planId].billing,
  organizationId,
  organizationName: owner?.organizationName ?? organizationId,
  plan: planId,
  planName: planLabel(plans[planId]),
});

export interface BillingUpdate {
  readonly organizationId: string;
  readonly owner: OrganizationOwner | null;
  readonly changes: readonly PlanChange[];
  readonly tags: readonly string[];
  /** Seats after the change, from the refreshed billing state. */
  readonly seats: number | null;
  readonly nowMs: number;
}

const cancellation = (change: PlanChange) => {
  const previous = change.previous_attributes;
  if (!(previous && Object.hasOwn(previous, "canceled_at"))) {
    return null;
  }
  const canceled = Boolean(change.subscription?.canceled_at);
  const wasCanceled = Boolean(previous.canceled_at);
  if (canceled === wasCanceled) {
    return null;
  }
  return canceled ? "canceled" : "resumed";
};

/** Events for a plan that started: a trial, a subscription or a purchase. */
const started = (
  update: BillingUpdate,
  change: PlanChange,
  planId: PlanId
): BillingTelemetry => {
  const plan = plans[planId];
  const scope = planScope(update.organizationId, update.owner, planId);
  const seats = update.seats ?? plan.seats;
  const amount = planAmount(plan, seats);
  const trialEndsAt = change.subscription?.trial_ends_at ?? null;
  if (plan.billing === "lifetime") {
    return {
      name: "lifetime_purchased",
      properties: {
        ...scope,
        ...charge(amount),
        description: `${scope.organizationName} bought ${plan.name} for ${priceLabel(plan, amount)}.`,
      },
    };
  }
  if (trialEndsAt !== null && trialEndsAt > update.nowMs) {
    return {
      name: "trial_started",
      properties: {
        ...scope,
        description: `${scope.organizationName} started a ${scope.planName} trial (${priceLabel(plan, amount)} after).`,
        planPrice: amount,
        trialEndsAt: isoFromMs(trialEndsAt),
      },
    };
  }
  return {
    name: "subscription_started",
    properties: {
      ...scope,
      ...charge(amount),
      description: `${scope.organizationName} subscribed to ${scope.planName}: ${priceLabel(plan, amount)}.`,
      seats,
    },
  };
};

/** Events for one change that isn't a plan starting. */
const changed = (
  update: BillingUpdate,
  change: PlanChange,
  planId: PlanId
): readonly BillingTelemetry[] => {
  const plan = plans[planId];
  const scope = planScope(update.organizationId, update.owner, planId);
  const who = scope.organizationName;
  const events: BillingTelemetry[] = [];
  if (
    change.subscription?.past_due === true &&
    change.previous_attributes?.past_due !== true
  ) {
    events.push({
      name: "payment_failed",
      properties: {
        ...scope,
        description: `Couldn't charge ${who} for ${scope.planName}.`,
      },
    });
  }
  const cancel = cancellation(change);
  if (cancel === "canceled") {
    const endsAt = isoFromMs(
      change.subscription?.expires_at ?? change.subscription?.current_period_end
    );
    events.push({
      name: "subscription_canceled",
      properties: {
        ...scope,
        description: `${who} canceled ${scope.planName}${endsAt ? `; it ends ${endsAt.slice(0, 10)}` : ""}.`,
        endsAt,
      },
    });
  }
  if (cancel === "resumed") {
    events.push({ name: "subscription_resumed", properties: scope });
  }
  // A trial whose first charge failed hasn't converted (yet).
  if (
    change.action !== "expired" &&
    change.subscription?.past_due !== true &&
    update.tags.includes("trial_ended")
  ) {
    const seats = update.seats ?? plan.seats;
    const amount = planAmount(plan, seats);
    events.push({
      name: "trial_converted",
      properties: {
        ...scope,
        ...charge(amount),
        description: `${who}'s ${scope.planName} trial converted: ${priceLabel(plan, amount)}.`,
        seats,
      },
    });
  }
  if (change.action === "expired") {
    events.push({
      name: "subscription_ended",
      properties: {
        ...scope,
        description: `${who}'s ${scope.planName} plan ended.`,
      },
    });
  }
  return events;
};

/**
 * The telemetry for one `billing.updated` webhook. A plan activated with
 * another expiring in the same event is a plan change; otherwise each change
 * is read on its own (Autumn's actions: activated, scheduled, updated,
 * expired; tags: trial_ended, phase_changed).
 */
export const billingTelemetry = (
  update: BillingUpdate
): readonly BillingTelemetry[] => {
  const ours = update.changes.flatMap((change) => {
    const planId = changedPlan(change);
    return planId ? [{ change, planId }] : [];
  });
  const activated = ours.find(({ change }) => change.action === "activated");
  const expired = ours.find(({ change }) => change.action === "expired");
  if (activated && expired) {
    return [
      {
        name: "plan_changed",
        properties: {
          ...planScope(update.organizationId, update.owner, activated.planId),
          description: `${update.owner?.organizationName ?? update.organizationId} moved from ${planLabel(plans[expired.planId])} to ${planLabel(plans[activated.planId])}.`,
          previousPlan: expired.planId,
        },
      },
    ];
  }
  return ours.flatMap(({ change, planId }) =>
    change.action === "activated"
      ? [started(update, change, planId)]
      : changed(update, change, planId)
  );
};

/** A checkout Autumn opened (or completed at once, with a saved card). */
export const checkoutStarted = (
  organizationId: string,
  owner: OrganizationOwner | null,
  planId: PlanId
): BillingTelemetry => ({
  name: "checkout_started",
  properties: planScope(organizationId, owner, planId),
});

export interface SeatsUpdate {
  readonly organizationId: string;
  readonly owner: OrganizationOwner | null;
  readonly planId: PlanId;
  readonly before: number;
  readonly seats: number;
}

const seatCount = (seats: number) =>
  `${seats} ${seats === 1 ? "seat" : "seats"}`;

/** Seats bought or dropped; null when the plan's seats didn't change. */
export const seatsTelemetry = (
  update: SeatsUpdate
): BillingTelemetry | null => {
  const plan = plans[update.planId];
  const difference = update.seats - update.before;
  if (difference === 0 || plan.extraSeatPrice === null) {
    return null;
  }
  const scope = planScope(update.organizationId, update.owner, update.planId);
  if (difference < 0) {
    return {
      name: "seats_removed",
      properties: {
        ...scope,
        description: `${scope.organizationName} removed ${seatCount(-difference)}, ${update.seats} left.`,
        removed: -difference,
        seats: update.seats,
      },
    };
  }
  const amount = difference * plan.extraSeatPrice;
  return {
    name: "seats_added",
    properties: {
      ...scope,
      ...charge(amount),
      added: difference,
      description: `${scope.organizationName} added ${seatCount(difference)} (${priceLabel(plan, amount)}), ${update.seats} in total.`,
      seats: update.seats,
    },
  };
};
