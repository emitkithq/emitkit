/**
 * The hosted plans, as the dashboard shows them and the server checks them.
 * Autumn (`autumn.config.ts`) is the source of truth for what gets charged:
 * change a price there first, then here.
 */
export const planIds = [
  "solo",
  "solo_annual",
  "team",
  "team_annual",
  "solo_lifetime",
  "team_lifetime",
] as const;

export type PlanId = (typeof planIds)[number];

export type PlanBilling = "month" | "year" | "lifetime";

export interface PlanInfo {
  readonly id: PlanId;
  readonly name: string;
  readonly price: number;
  readonly billing: PlanBilling;
  /** Seats the price includes. */
  readonly seats: number;
  /** Price of each seat past `seats`, per billing period; null when seats are fixed. */
  readonly extraSeatPrice: number | null;
  readonly trialDays: number;
}

export const plans: Readonly<Record<PlanId, PlanInfo>> = {
  solo: {
    billing: "month",
    extraSeatPrice: 9,
    id: "solo",
    name: "Solo",
    price: 9,
    seats: 1,
    trialDays: 14,
  },
  solo_annual: {
    billing: "year",
    extraSeatPrice: 90,
    id: "solo_annual",
    name: "Solo",
    price: 90,
    seats: 1,
    trialDays: 14,
  },
  // Launch ladder: the price moves up every 5 sales (see autumn.config.ts).
  solo_lifetime: {
    billing: "lifetime",
    extraSeatPrice: null,
    id: "solo_lifetime",
    name: "Solo Lifetime",
    price: 79,
    seats: 1,
    trialDays: 0,
  },
  team: {
    billing: "month",
    extraSeatPrice: 9,
    id: "team",
    name: "Team",
    price: 39,
    seats: 5,
    trialDays: 14,
  },
  team_annual: {
    billing: "year",
    extraSeatPrice: 90,
    id: "team_annual",
    name: "Team",
    price: 390,
    seats: 5,
    trialDays: 14,
  },
  team_lifetime: {
    billing: "lifetime",
    extraSeatPrice: null,
    id: "team_lifetime",
    name: "Team Lifetime",
    price: 499,
    seats: 5,
    trialDays: 0,
  },
};

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (planIds as readonly string[]).includes(value);
