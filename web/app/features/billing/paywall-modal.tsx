import { PhotoPanel, RecipePanel } from "@app/features/billing/recipe-panel";
import { errorMessage } from "@app/lib/errors";
import { calendarDate } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { signOut } from "@app/lib/session";
import { Button, Modal, toast } from "@heroui/react";
import { plans } from "@shared/billing";
import type { PlanBilling, PlanId, PlanInfo } from "@shared/billing";
import type { BillingStatus } from "@shared/rpc/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Wordmark } from "@ui/brand-mark";
import { Icon } from "@ui/icon";
import { useMemo, useState } from "react";

const PERIODS: readonly { id: PlanBilling; label: string; note?: string }[] = [
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly", note: "2 months free" },
  { id: "lifetime", label: "Lifetime" },
];

const OFFERS: Readonly<Record<PlanBilling, readonly [PlanId, PlanId]>> = {
  lifetime: ["solo_lifetime", "team_lifetime"],
  month: ["solo", "team"],
  year: ["solo_annual", "team_annual"],
};

const SUFFIX: Readonly<Record<PlanBilling, string>> = {
  lifetime: " once",
  month: "/mo",
  year: "/yr",
};

/** When a trial started now would end, as a calendar date. */
const trialEndDate = () =>
  calendarDate(
    new Date(Date.now() + plans.solo.trialDays * 86_400_000).toISOString()
  );

const features = (plan: PlanInfo) => [
  "Unlimited events, projects and channels",
  "Push notifications on every device",
  plan.extraSeatPrice === null
    ? `${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}, yours for good`
    : `${plan.seats} ${plan.seats === 1 ? "seat" : "seats"} included, +$${plan.extraSeatPrice} per extra seat`,
  "Live feed, revenue and MCP for your agents",
  plan.trialDays
    ? `${plan.trialDays}-day free trial, cancel anytime`
    : "Pay once. Launch price goes up as it sells",
];

/** The brand side for a plan that ended: the kit's photograph and a line. */
const BrandPanel = () => (
  <PhotoPanel className="h-36">
    <Wordmark className="h-[26px] w-auto self-start" tone="white" />
    <div>
      <p className="text-paper m-0 text-[20px] leading-[1.15] font-normal tracking-[-0.02em] text-balance sm:text-[26px]">
        Hear about your next signup.
      </p>
      <p className="text-body text-paper/75 m-0 mt-2 hidden sm:block">
        Payments, signups and alerts from your code, on every device.
      </p>
    </div>
  </PhotoPanel>
);

/**
 * The paywall: a modal over the dashboard while the organization has no plan.
 * A new organization starts its trial here (checkout returns into the setup
 * guide); one whose plan ended picks a new one. It can't be dismissed, but
 * Settings and signing out stay one click away.
 */
export const PaywallModal = ({
  isOpen,
  status,
}: {
  isOpen: boolean;
  status: BillingStatus;
}) => {
  const ended = status.state === "ended";
  const [period, setPeriod] = useState<PlanBilling>("month");
  const [choice, setChoice] = useState<"solo" | "team">("solo");
  const planId = OFFERS[period][choice === "solo" ? 0 : 1];
  const plan = plans[planId];
  // The trial end as of opening the paywall; it doesn't need to tick.
  const trialEnds = useMemo(() => trialEndDate(), []);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const checkout = useMutation({
    mutationFn: () =>
      rpc.billing.checkout({
        planId,
        returnTo: ended ? "billing" : "setup",
      }),
    onError: (error) =>
      toast.danger(errorMessage(error, "Checkout couldn't be opened.")),
    onSuccess: async ({ url }) => {
      if (url) {
        window.location.assign(url);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
    },
  });
  const leave = useMutation({
    mutationFn: async () => {
      await signOut(queryClient);
      await navigate({ href: "/auth/sign-in", replace: true });
    },
  });

  return (
    <Modal.Backdrop
      isDismissable={false}
      isKeyboardDismissDisabled
      isOpen={isOpen}
    >
      <Modal.Container className="p-0 sm:p-8" placement="center">
        <Modal.Dialog
          aria-label={ended ? "Pick a plan" : "Start your free trial"}
          className="bg-surface h-full max-w-none rounded-none p-2 sm:h-auto sm:max-h-[calc(var(--visual-viewport-height)-4rem)] sm:w-[min(920px,calc(100vw-4rem))] sm:rounded-[28px]"
          data-paywall={status.state}
        >
          <div className="flex h-full min-h-0 flex-col gap-2 sm:min-h-[600px] sm:flex-row">
            {ended ? <BrandPanel /> : <RecipePanel />}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-4 sm:px-6 sm:pt-7">
              <div className="border-border rounded-2xl border px-5 py-4 text-center">
                <Modal.Heading className="text-label text-foreground m-0 font-semibold">
                  {ended
                    ? "Your plan ended"
                    : `Start your ${plans.solo.trialDays}-day free trial`}
                </Modal.Heading>
                <p className="text-body text-muted m-0 mt-1">
                  {ended
                    ? "Events are still recorded. Pick a plan to turn push notifications back on."
                    : `Nothing is charged until ${trialEnds}. We'll remind you before the trial ends.`}
                </p>
              </div>

              <fieldset className="border-border mt-4 grid grid-cols-3 rounded-2xl border p-1">
                <legend className="sr-only">Billing period</legend>
                {PERIODS.map((option) => {
                  const selected = option.id === period;
                  return (
                    <label
                      className={`text-body has-[:focus-visible]:ring-focus flex cursor-pointer flex-col items-center justify-center rounded-xl px-2 py-2 has-[:focus-visible]:ring-2 sm:flex-row sm:gap-2 ${
                        selected
                          ? "bg-accent-soft text-accent-soft-foreground font-medium ring-1 ring-[color:var(--accent)]"
                          : "text-muted hover:text-foreground"
                      }`}
                      key={option.id}
                    >
                      <input
                        checked={selected}
                        className="sr-only"
                        name="period"
                        onChange={() => setPeriod(option.id)}
                        type="radio"
                        value={option.id}
                      />
                      {option.label}
                      {option.note ? (
                        <span className="text-meta opacity-80">
                          {option.note}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </fieldset>

              <fieldset className="border-border mt-3 rounded-2xl border p-1">
                <legend className="sr-only">Plan</legend>
                {(["solo", "team"] as const).map((option) => {
                  const offer =
                    plans[OFFERS[period][option === "solo" ? 0 : 1]];
                  const selected = option === choice;
                  return (
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 ${
                        selected
                          ? "bg-default-soft"
                          : "hover:bg-default-soft/60"
                      }`}
                      data-plan={offer.id}
                      key={option}
                    >
                      <input
                        checked={selected}
                        className="size-4 accent-[color:var(--accent)]"
                        name="plan"
                        onChange={() => setChoice(option)}
                        type="radio"
                        value={offer.id}
                      />
                      <span className="text-body text-foreground flex-1">
                        {offer.name.replace(" Lifetime", "")}
                        <span className="text-meta text-muted ml-2">
                          {offer.seats} {offer.seats === 1 ? "seat" : "seats"}
                        </span>
                      </span>
                      <span className="text-body text-foreground tabular-nums">
                        ${offer.price}
                        <span className="text-muted">{SUFFIX[period]}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="border-border mt-3 rounded-2xl border px-5 py-4">
                <p className="text-label text-foreground m-0 font-semibold">
                  What you get
                </p>
                <ul className="text-body text-muted m-0 mt-3 grid list-none gap-2 p-0">
                  {features(plan).map((line) => (
                    <li className="flex items-start gap-2.5" key={line}>
                      <Icon
                        className="text-accent mt-0.5 shrink-0"
                        name="check"
                        size={15}
                      />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="text-meta text-muted m-0 mt-4">
                  Rather run it yourself? It’s free to{" "}
                  <a
                    className="text-foreground underline underline-offset-2"
                    href="https://emitkit.com/docs/self-hosting"
                    rel="noreferrer"
                    target="_blank"
                  >
                    self-host on Cloudflare
                  </a>
                  .
                </p>
              </div>

              <div className="bg-surface sticky bottom-0 mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 pb-1 sm:static sm:pb-0">
                <div className="text-meta text-muted flex items-center gap-3">
                  <Link
                    className="hover:text-foreground"
                    search={(prev) => ({ ...prev, settings: "account" })}
                    to="."
                  >
                    Settings
                  </Link>
                  <button
                    className="hover:text-foreground"
                    disabled={leave.isPending}
                    onClick={() => leave.mutate()}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
                {status.canManage ? (
                  <Button
                    isPending={checkout.isPending}
                    onPress={() => checkout.mutate()}
                    size="lg"
                  >
                    {plan.trialDays ? "Start free trial" : `Buy ${plan.name}`}
                    <Icon name="chevron-right" size={16} />
                  </Button>
                ) : (
                  <p className="text-meta text-muted m-0 max-w-[16rem] text-right">
                    Only owners and admins can pick a plan. Ask one of them.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
