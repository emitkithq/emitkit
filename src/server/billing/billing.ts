import {
  checkoutStarted,
  seatsTelemetry,
} from "@server/billing/billing-telemetry";
import {
  describeFailure,
  infrastructure,
  InvalidInputError,
} from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Memberships } from "@server/organizations/memberships";
import type { OrganizationOwner } from "@server/organizations/memberships";
import { Autumn } from "@server/platform/autumn";
import type {
  AutumnCustomer,
  AutumnSubscription,
  CustomerIdentity,
} from "@server/platform/autumn";
import { AppConfig } from "@server/platform/config";
import { Telemetry } from "@server/platform/telemetry";
import { ownerActor } from "@server/telemetry/actors";
import { isPlanId, plans } from "@shared/billing";
import type { PlanId } from "@shared/billing";
import type {
  BillingState,
  BillingStatus,
  SeatsPreview,
} from "@shared/rpc/schemas";
import { Context, DateTime, Duration, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

interface BillingRow {
  readonly organization_id: string;
  readonly plan_id: string | null;
  readonly has_access: number;
  readonly seats: number;
  readonly trialing: number;
  readonly past_due: number;
  readonly trial_ends_at: string | null;
  readonly renews_at: string | null;
  readonly cancels_at: string | null;
  readonly ever_subscribed: number;
  readonly refreshed_at: string | null;
  readonly comp_until: string | null;
}

/** Autumn's view is re-read at most this often; webhooks refresh it sooner. */
const CACHE_TTL = Duration.minutes(15);

/** Push and the dashboard are paused in these states. */
const LOCKED: ReadonlySet<BillingState> = new Set(["required", "ended"]);

const isoFromMs = (ms: number | null) =>
  ms === null ? null : DateTime.formatIso(DateTime.makeUnsafe(ms));

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

const planOf = (row: BillingRow): PlanId | null =>
  isPlanId(row.plan_id) ? row.plan_id : null;

/** The state a cached row describes at `now` (ISO). */
const stateOf = (row: BillingRow | null, now: string): BillingState => {
  if (!row) {
    return "required";
  }
  if (row.has_access && planOf(row)) {
    if (row.past_due) {
      return "past_due";
    }
    return row.trialing ? "trialing" : "active";
  }
  // Access without one of the priced plans: granted in Autumn's admin (the
  // hidden `comp` plan), or the beta comp stored here.
  if (row.has_access || (row.comp_until && row.comp_until > now)) {
    return "comped";
  }
  return row.ever_subscribed ? "ended" : "required";
};

/** Seats an organization may fill in a state; null means no limit. */
const seatLimit = (row: BillingRow | null, state: BillingState) => {
  switch (state) {
    case "trialing":
    case "active":
    case "past_due": {
      return row?.seats ?? 1;
    }
    case "comped":
    case "off": {
      return null;
    }
    default: {
      return 1;
    }
  }
};

/** The organization's EmitKit subscription in Autumn, if it has one. */
const activeSubscription = (customer: AutumnCustomer | null) =>
  customer?.subscriptions.find(
    (candidate) => isPlanId(candidate.plan_id) && candidate.status !== "expired"
  ) ?? null;

/** Renewal, cancellation and trial dates of a subscription. */
const subscriptionDates = (
  subscription: AutumnSubscription | null,
  nowMs: number
) => {
  if (!subscription) {
    return {
      cancelsAt: null,
      pastDue: false,
      renewsAt: null,
      trialEndsAt: null,
      trialing: false,
    };
  }
  const cancelled = subscription.canceled_at !== null;
  const trialEndsAt = subscription.trial_ends_at;
  return {
    cancelsAt: cancelled
      ? isoFromMs(subscription.expires_at ?? subscription.current_period_end)
      : null,
    pastDue: subscription.past_due,
    renewsAt: cancelled ? null : isoFromMs(subscription.current_period_end),
    trialEndsAt: isoFromMs(trialEndsAt),
    trialing: trialEndsAt !== null && trialEndsAt > nowMs,
  };
};

/** Autumn's customer record, reduced to the columns this service caches. */
const fromCustomer = (customer: AutumnCustomer | null, nowMs: number) => {
  const subscription = activeSubscription(customer);
  const purchase =
    customer?.purchases.find((candidate) => isPlanId(candidate.plan_id)) ??
    null;
  return {
    ...subscriptionDates(subscription, nowMs),
    hasAccess: customer ? "hosted" in customer.flags : false,
    planId: subscription?.plan_id ?? purchase?.plan_id ?? null,
    seats: Math.max(1, customer?.balances.seats?.granted ?? 1),
  };
};

/** Autumn's customer: the organization, reached through its owner. */
const customerIdentity = (
  organizationId: string,
  owner: OrganizationOwner | null
): CustomerIdentity => ({
  email: owner?.email ?? null,
  id: organizationId,
  name: owner?.organizationName ?? organizationId,
});

export interface CheckoutRequest {
  readonly organizationId: string;
  readonly planId: PlanId;
  readonly successUrl: string;
}

/**
 * Hosted billing: which organizations may use push and the dashboard, and
 * the plan changes behind that. Autumn owns plans and payments; this service
 * keeps a short-lived copy per organization in `organization_billing` so the
 * push path never waits on Autumn. With billing off (self-hosted), every
 * organization is `off` and nothing is gated.
 *
 * A new organization needs a plan from the start: signing up leads to a
 * 14-day, card-required trial. The Autumn customer is the organization, and
 * seats are its members plus pending invitations. (`first_push_at` in the
 * table is from an earlier "free until the first push" rule and is unused.)
 */
export class Billing extends Context.Service<
  Billing,
  {
    readonly enabled: boolean;
    readonly status: (
      organizationId: string,
      options?: { readonly refresh?: boolean }
    ) => Effect.Effect<Omit<BillingStatus, "canManage">, InfrastructureError>;
    /** Whether event pushes go out. Never fails: an outage keeps pushes on. */
    readonly pushAllowed: (organizationId: string) => Effect.Effect<boolean>;
    /** Why inviting `email` isn't allowed, or null when it is. */
    readonly inviteBlocked: (
      organizationId: string,
      email: string
    ) => Effect.Effect<string | null, InfrastructureError>;
    readonly checkout: (
      request: CheckoutRequest
    ) => Effect.Effect<string | null, InvalidInputError | InfrastructureError>;
    readonly portal: (
      organizationId: string,
      returnUrl: string
    ) => Effect.Effect<string, InvalidInputError | InfrastructureError>;
    readonly previewSeats: (
      organizationId: string,
      seats: number
    ) => Effect.Effect<SeatsPreview, InvalidInputError | InfrastructureError>;
    readonly setSeats: (
      organizationId: string,
      seats: number
    ) => Effect.Effect<void, InvalidInputError | InfrastructureError>;
    /**
     * Creates the organization's Autumn customer, so it can be found (and
     * granted plans) in Autumn's admin from the start. Never fails.
     */
    readonly registerCustomer: (organizationId: string) => Effect.Effect<void>;
    /** Re-reads Autumn now (webhooks). */
    readonly refresh: (
      organizationId: string
    ) => Effect.Effect<void, InfrastructureError>;
    /** The organization is gone: stop its subscription. Never fails. */
    readonly release: (organizationId: string) => Effect.Effect<void>;
  }
>()("emitkit/billing/Billing") {
  static readonly layer = Layer.effect(
    Billing,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const config = yield* AppConfig;
      const autumn = yield* Autumn;
      const memberships = yield* Memberships;
      const telemetry = yield* Telemetry;
      const enabled = config.billing !== null;

      const read = Effect.fn("Billing.read")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<BillingRow>`
          select * from organization_billing where organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("billing.read")));
        return rows[0] ?? null;
      });

      const refresh = Effect.fn("Billing.refresh")(function* (
        organizationId: string
      ) {
        const customer = yield* autumn.customer(organizationId);
        const nowMs = yield* Effect.clockWith(
          (clock) => clock.currentTimeMillis
        );
        const view = fromCustomer(customer, nowMs);
        const now = yield* nowIso;
        yield* sql`
          insert into organization_billing ${sql.insert({
            cancels_at: view.cancelsAt,
            ever_subscribed: view.planId ? 1 : 0,
            has_access: view.hasAccess ? 1 : 0,
            organization_id: organizationId,
            past_due: view.pastDue ? 1 : 0,
            plan_id: view.planId,
            refreshed_at: now,
            renews_at: view.renewsAt,
            seats: view.seats,
            trial_ends_at: view.trialEndsAt,
            trialing: view.trialing ? 1 : 0,
            updated_at: now,
          })}
          on conflict (organization_id) do update set
            plan_id = excluded.plan_id, has_access = excluded.has_access,
            seats = excluded.seats, trialing = excluded.trialing,
            past_due = excluded.past_due, trial_ends_at = excluded.trial_ends_at,
            renews_at = excluded.renews_at, cancels_at = excluded.cancels_at,
            ever_subscribed = max(organization_billing.ever_subscribed, excluded.ever_subscribed),
            refreshed_at = excluded.refreshed_at, updated_at = excluded.updated_at
        `.pipe(Effect.mapError(infrastructure("billing.refresh")));
      });

      /** The cached row, re-read from Autumn when stale; an outage keeps the cache. */
      const current = Effect.fn("Billing.current")(function* (
        organizationId: string,
        force: boolean
      ) {
        const cached = yield* read(organizationId);
        const nowMs = yield* Effect.clockWith(
          (clock) => clock.currentTimeMillis
        );
        const stale =
          !cached?.refreshed_at ||
          nowMs -
            DateTime.toEpochMillis(DateTime.makeUnsafe(cached.refreshed_at)) >
            Duration.toMillis(CACHE_TTL);
        if (!(force || stale)) {
          return cached;
        }
        const refreshed = yield* refresh(organizationId).pipe(
          Effect.as(true),
          Effect.catchTag("InfrastructureError", (failure) =>
            Effect.logWarning(
              "billing refresh failed; using cache",
              describeFailure(failure)
            ).pipe(Effect.as(false))
          )
        );
        return refreshed ? yield* read(organizationId) : cached;
      });

      /** Members plus pending invitations, not counting one to `except` (a resend). */
      const seatsUsed = Effect.fn("Billing.seatsUsed")(function* (
        organizationId: string,
        except: string | null = null
      ) {
        const now = yield* nowIso;
        const nowMs = yield* Effect.clockWith(
          (clock) => clock.currentTimeMillis
        );
        const rows = yield* sql<{ readonly used: number }>`
          select
            (select count(*) from member where "organizationId" = ${organizationId})
            + (select count(*) from invitation
               where "organizationId" = ${organizationId} and status = 'pending'
               and lower(email) != lower(${except ?? ""})
               and ("expiresAt" > ${now}
                    or (typeof("expiresAt") in ('integer', 'real') and "expiresAt" > ${nowMs})))
            as used
        `.pipe(Effect.mapError(infrastructure("billing.seatsUsed")));
        return rows[0]?.used ?? 0;
      });

      const status = Effect.fn("Billing.status")(function* (
        organizationId: string,
        options?: { readonly refresh?: boolean }
      ) {
        const used = yield* seatsUsed(organizationId);
        if (!enabled) {
          return {
            cancelsAt: null,
            compUntil: null,
            planId: null,
            renewsAt: null,
            seats: null,
            seatsUsed: used,
            state: "off",
            trialEndsAt: null,
          } satisfies Omit<BillingStatus, "canManage">;
        }
        const row = yield* current(organizationId, options?.refresh ?? false);
        const state = stateOf(row, yield* nowIso);
        return {
          cancelsAt: row?.cancels_at ?? null,
          compUntil: state === "comped" ? (row?.comp_until ?? null) : null,
          planId: row ? planOf(row) : null,
          renewsAt: row?.renews_at ?? null,
          seats: seatLimit(row, state),
          seatsUsed: used,
          state,
          trialEndsAt: row?.trialing ? row.trial_ends_at : null,
        } satisfies Omit<BillingStatus, "canManage">;
      });

      const pushAllowed = (organizationId: string) =>
        enabled
          ? Effect.gen(function* () {
              const row = yield* current(organizationId, false);
              return !LOCKED.has(stateOf(row, yield* nowIso));
            }).pipe(
              Effect.catchTag("InfrastructureError", (failure) =>
                Effect.logWarning(
                  "billing check failed; allowing push",
                  describeFailure(failure)
                ).pipe(Effect.as(true))
              )
            )
          : Effect.succeed(true);

      const inviteBlocked = Effect.fn("Billing.inviteBlocked")(function* (
        organizationId: string,
        email: string
      ) {
        const standing = yield* status(organizationId);
        const used = yield* seatsUsed(organizationId, email);
        if (standing.seats === null || used < standing.seats) {
          return null;
        }
        if (LOCKED.has(standing.state)) {
          return "Start a plan in Settings → Billing to invite members.";
        }
        const plan = standing.planId ? plans[standing.planId] : null;
        if (plan?.billing === "lifetime") {
          return `${plan.name} includes ${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}, and they're all in use. Remove a member or pending invitation first.`;
        }
        return `All ${standing.seats} seats are in use. Add a seat in Settings → Billing, then invite again.`;
      });

      const identity = Effect.fn("Billing.identity")(function* (
        organizationId: string
      ) {
        const owner = yield* memberships.owner(organizationId);
        return customerIdentity(organizationId, owner);
      });

      const requireEnabled = enabled
        ? Effect.void
        : Effect.fail(
            new InvalidInputError({
              message: "Billing is not available on this server",
            })
          );

      const checkout = Effect.fn("Billing.checkout")(function* (
        request: CheckoutRequest
      ) {
        yield* requireEnabled;
        const plan = plans[request.planId];
        const used = yield* seatsUsed(request.organizationId);
        if (plan.extraSeatPrice === null && used > plan.seats) {
          return yield* new InvalidInputError({
            message: `${plan.name} includes ${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}, but this organization has ${used} members and pending invitations.`,
          });
        }
        const owner = yield* memberships.owner(request.organizationId);
        yield* autumn.ensureCustomer(
          customerIdentity(request.organizationId, owner)
        );
        const url = yield* autumn.attach({
          customerId: request.organizationId,
          planId: request.planId,
          seats:
            plan.extraSeatPrice === null ? null : Math.max(used, plan.seats),
          successUrl: request.successUrl,
        });
        const started = checkoutStarted(
          request.organizationId,
          owner,
          request.planId
        );
        yield* telemetry.track(
          started.name,
          started.properties,
          ownerActor(owner)
        );
        if (url === null) {
          yield* refresh(request.organizationId);
        }
        return url;
      });

      const portal = Effect.fn("Billing.portal")(function* (
        organizationId: string,
        returnUrl: string
      ) {
        yield* requireEnabled;
        yield* autumn.ensureCustomer(yield* identity(organizationId));
        return yield* autumn.portal({ customerId: organizationId, returnUrl });
      });

      /** The recurring plan whose seats can change, and a valid new count. */
      const seatChange = Effect.fn("Billing.seatChange")(function* (
        organizationId: string,
        seats: number
      ) {
        yield* requireEnabled;
        const row = yield* current(organizationId, true);
        const planId = row && row.has_access ? planOf(row) : null;
        const plan = planId ? plans[planId] : null;
        if (!(planId && plan) || plan.extraSeatPrice === null) {
          return yield* new InvalidInputError({
            message: "Seats can only change on a monthly or yearly plan.",
          });
        }
        const used = yield* seatsUsed(organizationId);
        if (seats < Math.max(used, plan.seats)) {
          return yield* new InvalidInputError({
            message: `Keep at least ${Math.max(used, plan.seats)} seats: ${plan.name} includes ${plan.seats} and ${used} are in use.`,
          });
        }
        return {
          change: { customerId: organizationId, planId, seats },
          current: row?.seats ?? plan.seats,
        };
      });

      const previewSeats = Effect.fn("Billing.previewSeats")(function* (
        organizationId: string,
        seats: number
      ) {
        const { change } = yield* seatChange(organizationId, seats);
        const preview = yield* autumn.previewSeats(change);
        return {
          currency: preview.currency,
          dueNow: preview.total,
          nextAt: isoFromMs(preview.next_cycle?.starts_at ?? null),
          nextTotal: preview.next_cycle?.total ?? null,
        } satisfies SeatsPreview;
      });

      const setSeats = Effect.fn("Billing.setSeats")(function* (
        organizationId: string,
        seats: number
      ) {
        const { change, current: before } = yield* seatChange(
          organizationId,
          seats
        );
        yield* autumn.setSeats(change);
        yield* refresh(organizationId);
        if (seats === before) {
          return;
        }
        // After the response: the seats are already changed.
        yield* telemetry.background(
          "seats telemetry",
          Effect.gen(function* () {
            const owner = yield* memberships.owner(organizationId);
            const event = seatsTelemetry({
              before,
              organizationId,
              owner,
              planId: change.planId,
              seats,
            });
            if (event) {
              yield* telemetry.track(
                event.name,
                event.properties,
                ownerActor(owner)
              );
            }
          })
        );
      });

      const registerCustomer = (organizationId: string) =>
        enabled
          ? Effect.gen(function* () {
              yield* autumn.ensureCustomer(yield* identity(organizationId));
            }).pipe(
              Effect.catchTag("InfrastructureError", (failure) =>
                Effect.logWarning("creating the Autumn customer failed", {
                  organizationId,
                  ...describeFailure(failure),
                })
              )
            )
          : Effect.void;

      const release = (organizationId: string) =>
        enabled
          ? Effect.gen(function* () {
              const subscription = activeSubscription(
                yield* autumn.customer(organizationId)
              );
              if (subscription) {
                yield* autumn.cancelNow({
                  customerId: organizationId,
                  planId: subscription.plan_id,
                });
              }
            }).pipe(
              Effect.catchTag("InfrastructureError", (failure) =>
                Effect.logError("billing release failed", {
                  organizationId,
                  ...describeFailure(failure),
                })
              )
            )
          : Effect.void;

      return Billing.of({
        checkout,
        enabled,
        inviteBlocked,
        portal,
        previewSeats,
        pushAllowed,
        registerCustomer,
        refresh: (organizationId) =>
          enabled ? refresh(organizationId) : Effect.void,
        release,
        setSeats,
        status,
      });
    })
  );
}
