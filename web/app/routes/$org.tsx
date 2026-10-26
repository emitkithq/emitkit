import { DeviceNotice } from "@app/components/pwa/push-notice";
import { WorkspaceShell } from "@app/components/shell/workspace-shell";
import {
  BillingGate,
  isLocked,
  useBillingStatus,
} from "@app/features/billing/billing-gate";
import { PhoneSetup } from "@app/features/onboarding/phone-setup";
import { SetupGuide } from "@app/features/onboarding/setup-guide";
import { SettingsModal } from "@app/features/settings/settings-modal";
import { authClient } from "@app/lib/auth-client";
import {
  activateOrganization,
  listOrganizations,
  requireSession,
} from "@app/lib/session";
import type { SettingsSectionId } from "@app/lib/settings-sections";
import { isSettingsSection } from "@app/lib/settings-sections";
import { useListOrganizations } from "@better-auth-ui/react/plugins/organization";
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Follows a rename: when the organization's slug changes under us (renamed
 * in settings), move the URL to the new slug without leaving the page.
 */
const useFollowSlugRename = (organizationId: string, slug: string) => {
  const { data } = useListOrganizations(authClient);
  const { pathname, searchStr } = useLocation();
  const navigate = useNavigate();
  const current = data?.find((candidate) => candidate.id === organizationId);

  useEffect(() => {
    // Only while the URL still names the old slug. Right after a rename the
    // URL can already carry the new one while the route context still holds
    // the old one; rewriting then would append to the new slug in a loop.
    const oldPrefix = `/${slug}`;
    const onOldSlug =
      pathname === oldPrefix || pathname.startsWith(`${oldPrefix}/`);
    if (current?.slug && current.slug !== slug && onOldSlug) {
      const rest = pathname.slice(oldPrefix.length);
      navigate({ href: `/${current.slug}${rest}${searchStr}`, replace: true });
    }
  }, [current?.slug, navigate, pathname, searchStr, slug]);
};

export type GuideId = "setup" | "phone";

const isGuide = (value: unknown): value is GuideId =>
  value === "setup" || value === "phone";

/**
 * Search params every organization page accepts. `settings` opens the
 * settings modal on that section over the current page; `guide` opens the
 * setup guide or the phone setup.
 *
 * Note: Optional (not `| undefined`), as in `EventFilters`: a required key
 * would force every link under `/$org` to spell it out.
 */
export interface OrganizationSearch {
  settings?: SettingsSectionId;
  guide?: GuideId;
  /** Set on the return from Stripe's checkout, while the new plan is confirmed. */
  checkout?: "done";
}

/** Give up confirming a checkout after this long and show the paywall again. */
const CONFIRM_TIMEOUT_MS = 60_000;

const OrganizationLayout = () => {
  const { organization, organizations, viewer } = Route.useRouteContext();
  const { checkout, guide, settings } = Route.useSearch();
  const navigate = useNavigate();
  useFollowSlugRename(organization.id, organization.slug);
  const confirming = checkout === "done";
  const billing = useBillingStatus({ confirming });
  const locked = isLocked(billing.data);

  // Back from checkout: drop the marker once the plan shows up, or after a
  // minute without it (an abandoned or failed payment shows the paywall).
  useEffect(() => {
    if (!confirming) {
      return;
    }
    const clear = () =>
      navigate({
        replace: true,
        search: ({ checkout: _done, ...rest }) => rest,
        to: ".",
      });
    if (billing.data && !locked) {
      clear();
      return;
    }
    const timer = setTimeout(clear, CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [billing.data, confirming, locked, navigate]);
  return (
    <WorkspaceShell
      organization={organization}
      organizations={organizations}
      viewer={viewer}
    >
      <BillingGate
        confirming={confirming}
        settingsOpen={settings !== undefined}
        status={billing.data}
      >
        <Outlet />
      </BillingGate>
      {settings || guide ? null : <DeviceNotice userId={viewer.id} />}
      <SetupGuide
        // Opens once the organization has a plan (or billing is off).
        isOpen={guide === "setup" && billing.isSuccess && !locked}
        onClose={() =>
          navigate({ search: ({ guide: _closed, ...rest }) => rest, to: "." })
        }
        onPhone={() =>
          navigate({ search: (prev) => ({ ...prev, guide: "phone" }), to: "." })
        }
        org={organization.slug}
      />
      <PhoneSetup
        isOpen={guide === "phone"}
        onClose={() =>
          navigate({ search: ({ guide: _closed, ...rest }) => rest, to: "." })
        }
      />
      <SettingsModal
        onClose={() =>
          navigate({
            search: ({ settings: _closed, ...rest }) => rest,
            to: ".",
          })
        }
        org={organization.slug}
        organization={organization}
        section={settings}
        viewer={viewer}
      />
    </WorkspaceShell>
  );
};

export const Route = createFileRoute("/$org")({
  /**
   * The URL names the organization; the session's active organization is
   * what scopes every RPC. Keep them in step before any screen reads data.
   */
  async beforeLoad({ context: { queryClient }, location, params, preload }) {
    const session = await requireSession(queryClient, location.href);
    let organizations = await listOrganizations(queryClient, session.user.id);
    let organization = organizations.find(
      (candidate) => candidate.slug === params.org
    );
    if (!organization) {
      // Created or renamed a moment ago (maybe in another tab): ask again.
      organizations = await listOrganizations(queryClient, session.user.id, {
        fresh: true,
      });
      organization = organizations.find(
        (candidate) => candidate.slug === params.org
      );
    }
    if (!organization) {
      const fallback =
        organizations.find(
          (candidate) => candidate.id === session.session.activeOrganizationId
        ) ?? organizations[0];
      if (fallback) {
        throw redirect({
          params: { org: fallback.slug },
          replace: true,
          to: "/$org",
        });
      }
      throw redirect({ replace: true, to: "/" });
    }
    if (!preload && session.session.activeOrganizationId !== organization.id) {
      await activateOrganization(queryClient, session, organization.id);
    }
    return { organization, organizations, viewer: session.user };
  },
  component: OrganizationLayout,
  validateSearch: (search: Record<string, unknown>): OrganizationSearch => ({
    ...(isSettingsSection(search.settings)
      ? { settings: search.settings }
      : {}),
    ...(isGuide(search.guide) ? { guide: search.guide } : {}),
    ...(search.checkout === "done" ? { checkout: "done" as const } : {}),
  }),
});
