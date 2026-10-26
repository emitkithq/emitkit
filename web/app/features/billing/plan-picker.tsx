import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Tabs, toast } from "@heroui/react";
import { plans } from "@shared/billing";
import type { PlanBilling, PlanId, PlanInfo } from "@shared/billing";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@ui/icon";
import { useState } from "react";

const PERIODS: readonly { id: PlanBilling; label: string }[] = [
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
  { id: "lifetime", label: "Lifetime" },
];

const isPeriod = (value: unknown): value is PlanBilling =>
  PERIODS.some((period) => period.id === value);

const OFFERS: Readonly<Record<PlanBilling, readonly [PlanId, PlanId]>> = {
  lifetime: ["solo_lifetime", "team_lifetime"],
  month: ["solo", "team"],
  year: ["solo_annual", "team_annual"],
};

const priceSuffix = (plan: PlanInfo) => {
  switch (plan.billing) {
    case "month": {
      return "/ month";
    }
    case "year": {
      return "/ year";
    }
    default: {
      return "once";
    }
  }
};

const seatLine = (plan: PlanInfo) => {
  const included = `${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}`;
  if (plan.extraSeatPrice === null) {
    return `${included}, yours for good`;
  }
  const per = plan.billing === "year" ? "year" : "month";
  return `${included}, then $${plan.extraSeatPrice} per seat / ${per}`;
};

const PlanCard = ({
  canManage,
  onChoose,
  pending,
  plan,
}: {
  canManage: boolean;
  onChoose: (id: PlanId) => void;
  pending: PlanId | null;
  plan: PlanInfo;
}) => (
  <div
    className="border-border bg-surface flex flex-col rounded-2xl border p-5"
    data-plan={plan.id}
  >
    <p className="text-label text-foreground font-semibold">{plan.name}</p>
    <p className="mt-3 flex items-baseline gap-1.5">
      <span className="text-foreground text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        ${plan.price}
      </span>
      <span className="text-body text-muted">{priceSuffix(plan)}</span>
    </p>
    <ul className="text-body text-muted m-0 mt-4 grid list-none gap-2 p-0">
      {[
        "Unlimited events, projects and channels",
        seatLine(plan),
        plan.trialDays
          ? `${plan.trialDays}-day free trial, cancel anytime`
          : "Launch price: goes up as it sells",
      ].map((line) => (
        <li className="flex items-start gap-2" key={line}>
          <Icon
            className="text-accent mt-0.5 shrink-0"
            name="check"
            size={15}
          />
          {line}
        </li>
      ))}
    </ul>
    <Button
      className="mt-5"
      fullWidth
      isDisabled={!canManage || (pending !== null && pending !== plan.id)}
      isPending={pending === plan.id}
      onPress={() => onChoose(plan.id)}
      variant={plan.seats === 1 ? "primary" : "secondary"}
    >
      {plan.trialDays ? "Start free trial" : `Buy ${plan.name}`}
    </Button>
  </div>
);

/**
 * Solo and Team side by side, monthly, yearly or lifetime. Choosing one
 * opens Stripe's checkout (Autumn), which returns to Settings → Billing.
 */
export const PlanPicker = ({
  canManage,
  returnTo = "billing",
}: {
  canManage: boolean;
  /** Where checkout returns: Settings → Billing, or the setup guide. */
  returnTo?: "billing" | "setup";
}) => {
  const [period, setPeriod] = useState<PlanBilling>("month");
  const queryClient = useQueryClient();
  const checkout = useMutation({
    mutationFn: (planId: PlanId) => rpc.billing.checkout({ planId, returnTo }),
    onError: (error) =>
      toast.danger(errorMessage(error, "Checkout couldn't be opened.")),
    onSuccess: async ({ url }) => {
      if (url) {
        window.location.assign(url);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: orpc.billing.key(),
      });
      toast.success("Your plan is active");
    },
  });
  const pending = checkout.isPending ? (checkout.variables ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        className="w-fit"
        onSelectionChange={(key) => {
          if (isPeriod(key)) {
            setPeriod(key);
          }
        }}
        selectedKey={period}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Billing period">
            {PERIODS.map((option) => (
              <Tabs.Tab id={option.id} key={option.id}>
                {option.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <div className="grid gap-3 sm:grid-cols-2">
        {OFFERS[period].map((id) => (
          <PlanCard
            canManage={canManage}
            key={id}
            onChoose={(planId) => checkout.mutate(planId)}
            pending={pending}
            plan={plans[id]}
          />
        ))}
      </div>
      {canManage ? null : (
        <p className="text-meta text-muted">
          Only owners and admins can choose a plan. Ask one of them to pick it.
        </p>
      )}
    </div>
  );
};
