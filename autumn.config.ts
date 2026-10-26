/**
 * Hosted pricing in Autumn (https://docs.useautumn.com/cli/config), the
 * source of truth for what customers are charged. `src/shared/billing.ts`
 * mirrors the prices for the dashboard: change both together.
 *
 *   pnpm billing:push          # preview against the sandbox
 *   pnpm billing:push --yes    # apply to the sandbox
 *   pnpm billing:push -p       # preview against production (add --yes to apply)
 *
 * Keys come from AUTUMN_SECRET_KEY / AUTUMN_PROD_SECRET_KEY in .env.local
 * (`pnpm dlx atmn login`). Self-hosted deployments don't need any of this.
 */
import { atmn, feature, plan, variant } from "atmn";

// Features

// Gates the hosted dashboard: every paid plan grants it.
export const hosted = feature({
  internalId: "fe_3Jozs7EiQMvdV2dZjOuNczsvF5S",
  featureId: "hosted",
  name: "Hosted EmitKit",
  type: "boolean",
});

// Organization members. Non-consumable: a persistent count, never reset.
export const seats = feature({
  internalId: "fe_3Jozs81oy9iFy39nT4om06TiFLQ",
  featureId: "seats",
  name: "Seats",
  type: "metered",
  consumable: false,
});

const trial = {
  durationLength: 14,
  durationType: "day",
  cardRequired: true,
} as const;

const GROUP = "hosted";

// Solo: $9/mo, 1 seat, +$9 per extra seat. Yearly: $90, +$90 per seat.

export const soloAnnual = variant({
  internalId: "prod_3Jozs9JrYUpHyHrhTKRQFMFbxWN",
  variantPlanId: "solo_annual",
  versionSlug: "v1",
  name: "Solo (yearly)",
  customize: {
    price: { amount: 90, interval: "year" },
    removeItems: [
      {
        featureId: seats.featureId,
        billingMethod: "prepaid",
        interval: "month",
      },
    ],
    addItems: [
      {
        featureId: seats.featureId,
        included: 1,
        price: { amount: 90, interval: "year", billingMethod: "prepaid" },
      },
    ],
  },
});

export const solo = plan({
  internalId: "prod_3JozsA4fDzz1o2u4gdjdcvamT4c",
  planId: "solo",
  versionSlug: "v1",
  active: true,
  name: "Solo",
  group: GROUP,
  price: { amount: 9, interval: "month" },
  freeTrial: trial,
  items: [
    { featureId: hosted.featureId },
    {
      featureId: seats.featureId,
      included: 1,
      price: { amount: 9, interval: "month", billingMethod: "prepaid" },
    },
  ],
  variants: [soloAnnual],
});

// Team: $39/mo, 5 seats, +$9 per extra seat. Yearly: $390, +$90 per seat.

export const teamAnnual = variant({
  internalId: "prod_3Jozs9QRH3cdiADO9GeFl0oivOD",
  variantPlanId: "team_annual",
  versionSlug: "v1",
  name: "Team (yearly)",
  customize: {
    price: { amount: 390, interval: "year" },
    removeItems: [
      {
        featureId: seats.featureId,
        billingMethod: "prepaid",
        interval: "month",
      },
    ],
    addItems: [
      {
        featureId: seats.featureId,
        included: 5,
        price: { amount: 90, interval: "year", billingMethod: "prepaid" },
      },
    ],
  },
});

export const team = plan({
  internalId: "prod_3Jozs6FVihqArILjFQTi7Fz45uo",
  planId: "team",
  versionSlug: "v1",
  active: true,
  name: "Team",
  group: GROUP,
  price: { amount: 39, interval: "month" },
  freeTrial: trial,
  items: [
    { featureId: hosted.featureId },
    {
      featureId: seats.featureId,
      included: 5,
      price: { amount: 9, interval: "month", billingMethod: "prepaid" },
    },
  ],
  variants: [teamAnnual],
});

// Lifetime: one-off, fixed seats, no trial.
// Solo lifetime is a launch ladder in batches of 5 buyers: $79, $99, $119,
// then $149 for good. Each step is a new version (v2 $99, v3 $119, v4 $149)
// with the previous one set inactive, so the customer count per version is the
// sales count per step.

export const soloLifetime = plan({
  internalId: "prod_3Jozs92eO6ZqQ51Tzprmi53FEJj",
  planId: "solo_lifetime",
  versionSlug: "v1",
  active: true,
  name: "Solo Lifetime",
  group: GROUP,
  price: { amount: 79, interval: "one_off" },
  items: [
    { featureId: hosted.featureId },
    { featureId: seats.featureId, included: 1 },
  ],
});

export const teamLifetime = plan({
  internalId: "prod_3JozsBKuUwXCkfobbWPC5hFj6Qd",
  planId: "team_lifetime",
  versionSlug: "v1",
  active: true,
  name: "Team Lifetime",
  group: GROUP,
  price: { amount: 499, interval: "one_off" },
  items: [
    { featureId: hosted.featureId },
    { featureId: seats.featureId, included: 5 },
  ],
});

// Comp: free access granted by hand in Autumn's admin (attach it to an
// organization's customer). Never sold or shown on the site; the dashboard
// shows the organization as having free access.
export const comp = plan({
  internalId: "prod_3JpgTgnDGOUqLEoMMax2NOb9xs3",
  planId: "comp",
  versionSlug: "v1",
  active: true,
  name: "Comp (free access)",
  group: GROUP,
  items: [
    { featureId: hosted.featureId },
    { featureId: seats.featureId, unlimited: true },
  ],
});

export default atmn({
  features: [hosted, seats],
  plans: [solo, team, soloLifetime, teamLifetime, comp],
});
