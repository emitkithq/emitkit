import {
  SettingsCard,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@app/components/settings-primitives";
import { PlanPicker } from "@app/features/billing/plan-picker";
import { errorMessage } from "@app/lib/errors";
import { calendarDate } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, toast } from "@heroui/react";
import { plans } from "@shared/billing";
import type { BillingStatus } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/badge";
import { useEffect, useState } from "react";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(amount);

const STATE_LABEL: Record<BillingStatus["state"], string> = {
  active: "Active",
  comped: "Free",
  ended: "Ended",
  off: "Included",
  past_due: "Payment failed",
  required: "Plan needed",
  trialing: "Trial",
};

const planDescription = (status: BillingStatus) => {
  if (status.state === "trialing" && status.trialEndsAt) {
    return `Free trial until ${calendarDate(status.trialEndsAt)}. Your card is charged then unless you cancel.`;
  }
  if (status.state === "past_due") {
    return "The last payment failed. Update your payment method to keep push notifications on.";
  }
  if (status.cancelsAt) {
    return `Cancelled: ends on ${calendarDate(status.cancelsAt)}.`;
  }
  if (status.renewsAt) {
    return `Renews on ${calendarDate(status.renewsAt)}.`;
  }
  return "Paid once. Yours for good.";
};

/** Adds or removes seats on a monthly or yearly plan, after showing the price. */
const SeatsCard = ({ status }: { status: BillingStatus }) => {
  const queryClient = useQueryClient();
  const seats = status.seats ?? 1;
  const [target, setTarget] = useState(seats);
  // A saved change (or one made elsewhere) resets the counter.
  const [shownSeats, setShownSeats] = useState(seats);
  if (seats !== shownSeats) {
    setShownSeats(seats);
    setTarget(seats);
  }
  const plan = status.planId ? plans[status.planId] : null;
  const adjustable =
    status.canManage && plan !== null && plan.extraSeatPrice !== null;
  const minimum = Math.max(status.seatsUsed, plan?.seats ?? 1);
  const preview = useQuery({
    ...orpc.billing.previewSeats.queryOptions({ input: { seats: target } }),
    enabled: adjustable && target !== seats,
  });
  const save = useMutation({
    mutationFn: () => rpc.billing.setSeats({ seats: target }),
    onError: (error) =>
      toast.danger(errorMessage(error, "Seats couldn't be changed.")),
    onSuccess: async () => {
      toast.success("Seats updated");
      await queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
    },
  });

  return (
    <SettingsSection
      description={
        plan?.extraSeatPrice === null
          ? `${plan.name} includes ${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}. Members and pending invitations each take one.`
          : "Members and pending invitations each take a seat."
      }
      title="Seats"
    >
      <SettingsCard>
        <SettingsRow
          description={`${status.seatsUsed} in use`}
          label={`${seats} ${seats === 1 ? "seat" : "seats"}`}
        >
          {adjustable ? (
            <div className="flex items-center gap-1.5">
              <Button
                aria-label="Remove a seat"
                isDisabled={target <= minimum}
                isIconOnly
                onPress={() => setTarget((value) => value - 1)}
                size="sm"
                variant="secondary"
              >
                −
              </Button>
              <span
                className="text-body w-8 text-center tabular-nums"
                data-seat-target
              >
                {target}
              </span>
              <Button
                aria-label="Add a seat"
                isIconOnly
                onPress={() => setTarget((value) => value + 1)}
                size="sm"
                variant="secondary"
              >
                +
              </Button>
            </div>
          ) : null}
        </SettingsRow>
        {adjustable && target !== seats ? (
          <div className="border-separator flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <p className="text-body text-muted" data-seat-preview>
              {preview.data
                ? `${money(preview.data.dueNow, preview.data.currency)} now${
                    preview.data.nextTotal === null
                      ? ""
                      : `, then ${money(preview.data.nextTotal, preview.data.currency)} on the next invoice`
                  }`
                : "Working out the price…"}
            </p>
            <div className="flex gap-1.5">
              <Button
                onPress={() => setTarget(seats)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                isDisabled={!preview.data}
                isPending={save.isPending}
                onPress={() => save.mutate()}
                size="sm"
              >
                Confirm {target} seats
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
};

const CurrentPlan = ({ status }: { status: BillingStatus }) => {
  const plan = status.planId ? plans[status.planId] : null;
  const portal = useMutation({
    mutationFn: () => rpc.billing.portal(),
    onError: (error) =>
      toast.danger(
        errorMessage(error, "The billing portal couldn't be opened.")
      ),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  return (
    <>
      <SettingsSection
        actions={
          status.canManage ? (
            <Button
              isPending={portal.isPending}
              onPress={() => portal.mutate()}
              size="sm"
              variant="secondary"
            >
              Manage billing
            </Button>
          ) : null
        }
        description="Invoices, payment method and cancellation live in the billing portal."
        title="Plan"
      >
        <SettingsCard>
          <SettingsRow
            description={planDescription(status)}
            label={
              <span className="flex items-center gap-2">
                {plan?.name ?? "Plan"}
                <Badge tone={status.state === "past_due" ? "danger" : "accent"}>
                  {STATE_LABEL[status.state]}
                </Badge>
              </span>
            }
          />
        </SettingsCard>
      </SettingsSection>
      <SeatsCard status={status} />
    </>
  );
};

/**
 * Settings → Billing: the organization's plan, seats and the billing portal,
 * or the plans to choose from. Opening it re-reads Autumn, since this is
 * where checkout returns to.
 */
export const BillingSection = () => {
  const queryClient = useQueryClient();
  const status = useQuery(
    orpc.billing.status.queryOptions({ input: { refresh: true } })
  );
  useEffect(() => {
    if (status.data) {
      queryClient.setQueryData(
        orpc.billing.status.queryKey({ input: {} }),
        status.data
      );
    }
  }, [queryClient, status.data]);

  if (status.isPending) {
    return (
      <SettingsCard>
        <SettingsNote>Loading billing…</SettingsNote>
      </SettingsCard>
    );
  }
  if (status.isError) {
    return (
      <SettingsCard>
        <SettingsNote tone="danger">
          {errorMessage(status.error, "Billing couldn't be loaded.")}
        </SettingsNote>
      </SettingsCard>
    );
  }
  const current = status.data;
  switch (current.state) {
    case "off": {
      return (
        <SettingsSection title="Plan">
          <SettingsCard>
            <SettingsNote>
              This EmitKit server has no billing: everything is included.
            </SettingsNote>
          </SettingsCard>
        </SettingsSection>
      );
    }
    case "trialing":
    case "active":
    case "past_due": {
      return <CurrentPlan status={current} />;
    }
    default: {
      return (
        <SettingsSection
          description={
            {
              comped: current.compUntil
                ? `This organization has free access to hosted EmitKit until ${calendarDate(current.compUntil)}. You can pick a plan anytime.`
                : "This organization has free access to hosted EmitKit.",
              ended:
                "Your plan ended. Push notifications are paused until you pick a plan again.",
              required:
                "Start a plan to use hosted EmitKit. Monthly and yearly plans start with a 14-day free trial.",
            }[current.state]
          }
          title="Choose a plan"
        >
          <PlanPicker canManage={current.canManage} />
        </SettingsSection>
      );
    }
  }
};
