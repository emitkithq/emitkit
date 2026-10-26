import { authClient, unwrap } from "@app/lib/auth-client";
import { orpc } from "@app/lib/rpc";
import {
  authQueryKeys,
  ensureSession,
  getSafeRedirectTo,
  isReauthenticationSignInURL,
  sessionOptions,
} from "@better-auth-ui/core";
import {
  ensureListOrganizations,
  fetchListOrganizations,
  organizationQueryKeys,
} from "@better-auth-ui/core/plugins/organization";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

export type Session = typeof authClient.$Infer.Session;
export type Viewer = Session["user"];

export interface WorkspaceOrganization {
  id: string;
  /** Image URL for the organization's avatar; initials stand in without one. */
  logo?: string;
  name: string;
  slug: string;
}

/** `/auth/sign-in`, remembering where to come back to. */
export const signInHref = (redirectTo?: string): string => {
  if (!redirectTo || redirectTo === "/" || redirectTo.startsWith("/auth/")) {
    return "/auth/sign-in";
  }
  return `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;
};

/**
 * Auth pages only a signed-out visitor needs. Everything else under `/auth`
 * (sign-out, reset-password and verify-email links, the "sent" notices)
 * works the same signed in.
 */
const GUEST_AUTH_PATHS: ReadonlySet<string> = new Set([
  "email-otp",
  "forgot-password",
  "sign-in",
  "sign-up",
]);

/**
 * Sends a signed-in visitor on from a guest-only auth page, to its
 * `redirectTo` when that is a safe same-origin path, else to `/`. Sensitive
 * account actions send signed-in users to sign-in on purpose
 * (`reauthenticate=true`), and a failed session check shows the form rather
 * than locking anyone out.
 */
export const leaveGuestAuthPage = async (
  path: string,
  href: string
): Promise<void> => {
  const url = new URL(href, window.location.origin);
  if (!GUEST_AUTH_PATHS.has(path) || isReauthenticationSignInURL(url)) {
    return;
  }
  // Asked fresh and kept out of the query cache: a `null` cached here would
  // outlive the sign-in or sign-up this page is about to perform.
  const { data } = await authClient.getSession().catch(() => ({ data: null }));
  if (!data) {
    return;
  }
  const target = getSafeRedirectTo(
    url.searchParams.get("redirectTo"),
    url.origin
  );
  throw redirect({
    href: target.startsWith("/auth/") ? "/" : target,
    replace: true,
  });
};

/**
 * The current session, or a redirect to sign-in that returns to `redirectTo`.
 * A "signed out" cached before signing in outlives it (sign-in only marks it
 * stale), and sign-in sends a signed-in visitor straight back here, so a
 * missing session is asked for once more before redirecting.
 */
export const requireSession = async (
  queryClient: QueryClient,
  redirectTo: string
): Promise<Session> => {
  const session =
    (await ensureSession(queryClient, authClient)) ??
    (await queryClient.fetchQuery({
      ...sessionOptions(authClient),
      staleTime: 0,
    }));
  if (!session) {
    throw redirect({ href: signInHref(redirectTo) });
  }
  return session;
};

const toWorkspaceOrganizations = (
  organizations:
    | readonly {
        id: string;
        logo?: string | null;
        name: string;
        slug: string | null;
      }[]
    | null
    | undefined
): WorkspaceOrganization[] =>
  (organizations ?? []).flatMap((organization) =>
    organization.slug
      ? [
          {
            id: organization.id,
            ...(organization.logo ? { logo: organization.logo } : {}),
            name: organization.name,
            slug: organization.slug,
          },
        ]
      : []
  );

/**
 * The viewer's organizations, shared with Better Auth UI's own cache entry so
 * a rename or delete made through its components shows up here too.
 */
export const listOrganizations = async (
  queryClient: QueryClient,
  userId: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<WorkspaceOrganization[]> => {
  const organizations = fresh
    ? await fetchListOrganizations(queryClient, authClient, userId)
    : await ensureListOrganizations(queryClient, authClient, userId);
  return toWorkspaceOrganizations(organizations);
};

/**
 * Forget everything that was read on behalf of the previous organization:
 * every dashboard RPC result, and every user-scoped Better Auth query
 * (organization list, active organization, members, invitations).
 */
export const resetWorkspaceCaches = async (
  queryClient: QueryClient
): Promise<void> => {
  queryClient.removeQueries({ queryKey: orpc.key() });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: authQueryKeys.session }),
    queryClient.invalidateQueries({ queryKey: authQueryKeys.users() }),
  ]);
};

/**
 * Makes `organizationId` the session's active organization, which is what
 * scopes every dashboard RPC. Cached RPC results belong to the previous
 * organization, so they are dropped before any screen reads them.
 */
export const activateOrganization = async (
  queryClient: QueryClient,
  session: Session,
  organizationId: string
): Promise<void> => {
  await unwrap(authClient.organization.setActive({ organizationId }));
  queryClient.removeQueries({ queryKey: orpc.key() });
  queryClient.setQueryData<Session>(authQueryKeys.session, {
    ...session,
    session: { ...session.session, activeOrganizationId: organizationId },
  });
  await queryClient.invalidateQueries({
    queryKey: organizationQueryKeys.all(session.user.id),
  });
};

/** Signs out and forgets every cached read, so the next person starts clean. */
export const signOut = async (queryClient: QueryClient): Promise<void> => {
  await authClient.signOut();
  queryClient.clear();
};
