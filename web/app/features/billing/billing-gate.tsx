import { PaywallModal } from "@app/features/billing/paywall-modal";
import { orpc, rpc } from "@app/lib/rpc";
import { Spinner } from "@heroui/react";
import type { BillingStatus } from "@shared/rpc/schemas";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** How often to ask Autumn again while a finished checkout is confirmed. */
const CONFIRM_POLL_MS = 3000;

/** Push and the dashboard are paused in these states (see BillingState). */
export const isLocked = (status: BillingStatus | undefined) =>
  status?.state === "required" || status?.state === "ended";

/**
 * The organization's billing status. Right after Stripe's checkout returns
 * (`confirming`), it asks Autumn directly every few seconds until the plan
 * shows up, since the webhook may arrive a moment later.
 */
export const useBillingStatus = ({
  confirming = false,
}: { confirming?: boolean } = {}) =>
  useQuery({
    ...orpc.billing.status.queryOptions({ input: {} }),
    ...(confirming
      ? {
          queryFn: () => rpc.billing.status({ refresh: true }),
          refetchInterval: (query: { state: { data?: BillingStatus } }) =>
            isLocked(query.state.data) ? CONFIRM_POLL_MS : false,
        }
      : { refetchInterval: 5 * 60 * 1000 }),
  });

const Confirming = () => (
  <output
    className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-5 py-20 text-center"
    data-paywall="confirming"
  >
    <Spinner aria-label="Confirming your trial" size="md" />
    <p className="text-body text-muted">Confirming your trial…</p>
  </output>
);

/**
 * The organization's pages, with the paywall modal over them while it has no
 * plan: a new organization starts its trial there, and one whose plan ended
 * picks a new one. The modal steps aside while Settings is open, so members,
 * the account and billing can still be managed. `confirming` is set when
 * Stripe's checkout just returned.
 */
export const BillingGate = ({
  children,
  confirming,
  settingsOpen,
  status,
}: {
  children: ReactNode;
  confirming: boolean;
  settingsOpen: boolean;
  status: BillingStatus | undefined;
}) => {
  if (!(status && isLocked(status))) {
    return children;
  }
  if (confirming) {
    return <Confirming />;
  }
  return (
    <>
      {children}
      <PaywallModal isOpen={!settingsOpen} status={status} />
    </>
  );
};
