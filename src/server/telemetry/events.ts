import type { PlanBilling, PlanId } from "@shared/billing";
import { defineEvents, typed } from "trakoo";
import type { EventInputMap, EventName } from "trakoo";

/**
 * What the operator of this deployment learns about how it is used, sent
 * through trakoo to EmitKit (a push per event) and OpenPanel (everything).
 * Only sent when telemetry keys are configured; see `Telemetry`.
 *
 * EmitKit titles a push with the event name ("new_signup" → "New Signup"),
 * so names read as notification titles and `description` carries the
 * specifics. Money at the top level (`amount` + `currency`) is what EmitKit
 * counts as revenue, so only events that charge someone carry it.
 */

/** How an account was created. */
export type SignupMethod = "password" | "email_otp" | "dev" | "other";

/** Categories that push to EmitKit, and the channel each one lands in. */
export const pushChannels = {
  billing: "billing",
  churn: "churn",
  milestone: "milestones",
  signup: "signups",
} satisfies Record<string, string>;

interface Pushed {
  /** The push body. */
  readonly description: string;
}

interface OrganizationScoped {
  readonly organizationId: string;
  readonly organizationName: string;
}

interface PlanScoped extends OrganizationScoped {
  readonly plan: PlanId;
  readonly planName: string;
  readonly billing: PlanBilling;
}

/** Money charged, the way EmitKit counts revenue. */
export interface Revenue {
  readonly amount: number;
  readonly currency: "USD";
}

export const telemetryEvents = defineEvents({
  // Signups (pushed)
  newSignup: {
    category: "signup",
    name: "new_signup",
    properties: typed<Pushed & { name: string; method: SignupMethod }>(),
  },

  // Activation and usage (pushed)
  firstEventReceived: {
    category: "milestone",
    name: "first_event_received",
    properties: typed<Pushed & OrganizationScoped>(),
  },
  milestoneReached: {
    category: "milestone",
    name: "milestone_reached",
    properties: typed<Pushed & OrganizationScoped & { events: number }>(),
  },

  // Billing (pushed)
  trialStarted: {
    category: "billing",
    name: "trial_started",
    properties: typed<
      Pushed & PlanScoped & { planPrice: number; trialEndsAt: string | null }
    >(),
  },
  subscriptionStarted: {
    category: "billing",
    name: "subscription_started",
    properties: typed<Pushed & PlanScoped & Revenue & { seats: number }>(),
  },
  trialConverted: {
    category: "billing",
    name: "trial_converted",
    properties: typed<Pushed & PlanScoped & Revenue & { seats: number }>(),
  },
  lifetimePurchased: {
    category: "billing",
    name: "lifetime_purchased",
    properties: typed<Pushed & PlanScoped & Revenue>(),
  },
  planChanged: {
    category: "billing",
    name: "plan_changed",
    properties: typed<Pushed & PlanScoped & { previousPlan: PlanId }>(),
  },
  seatsAdded: {
    category: "billing",
    name: "seats_added",
    properties: typed<
      Pushed & PlanScoped & Revenue & { added: number; seats: number }
    >(),
  },
  seatsRemoved: {
    category: "billing",
    name: "seats_removed",
    properties: typed<
      Pushed & PlanScoped & { removed: number; seats: number }
    >(),
  },
  paymentFailed: {
    category: "billing",
    name: "payment_failed",
    properties: typed<Pushed & PlanScoped>(),
  },
  subscriptionCanceled: {
    category: "billing",
    name: "subscription_canceled",
    properties: typed<Pushed & PlanScoped & { endsAt: string | null }>(),
  },
  subscriptionEnded: {
    category: "billing",
    name: "subscription_ended",
    properties: typed<Pushed & PlanScoped>(),
  },

  // Churn (pushed)
  accountDeleted: {
    category: "churn",
    name: "account_deleted",
    properties: typed<Pushed & { name: string }>(),
  },
  organizationDeleted: {
    category: "churn",
    name: "organization_deleted",
    properties: typed<Pushed & OrganizationScoped>(),
  },

  // Product usage (OpenPanel only)
  organizationCreated: {
    category: "product",
    name: "organization_created",
    properties: typed<OrganizationScoped>(),
  },
  memberInvited: {
    category: "product",
    name: "member_invited",
    properties: typed<OrganizationScoped & { role: string }>(),
  },
  memberJoined: {
    category: "product",
    name: "member_joined",
    properties: typed<OrganizationScoped>(),
  },
  testEventSent: {
    category: "product",
    name: "test_event_sent",
    properties: typed<{ organizationId: string }>(),
  },
  pushEnabled: {
    category: "product",
    name: "push_enabled",
    properties: typed<{ organizations: number }>(),
  },
  checkoutStarted: {
    category: "product",
    name: "checkout_started",
    properties: typed<PlanScoped>(),
  },
  subscriptionResumed: {
    category: "product",
    name: "subscription_resumed",
    properties: typed<PlanScoped>(),
  },
});

export type TelemetryEvents = typeof telemetryEvents;
export type TelemetryEventName = EventName<TelemetryEvents>;
export type TelemetryProperties = EventInputMap<TelemetryEvents>;

/** The events EmitKit receives: those whose category has a push channel. */
export const pushedEventNames: readonly TelemetryEventName[] = Object.values(
  telemetryEvents
)
  .filter((event) => Object.hasOwn(pushChannels, event.category))
  .map((event) => event.name);
