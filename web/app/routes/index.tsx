import { orpc, rpc } from "@app/lib/rpc";
import { listOrganizations, requireSession } from "@app/lib/session";
import { organizationQueryKeys } from "@better-auth-ui/core/plugins/organization";
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The front door. Signed-out visitors go to sign-in. Someone without an
 * organization gets one made for them (a workspace, a project and a starter
 * key) and lands in it with the setup guide open; everyone else lands in
 * their active organization's event console.
 */
export const Route = createFileRoute("/")({
  async beforeLoad({ context: { queryClient } }) {
    const session = await requireSession(queryClient, "/");
    const [status, organizations] = await Promise.all([
      queryClient.fetchQuery(orpc.gettingStarted.status.queryOptions()),
      listOrganizations(queryClient, session.user.id, { fresh: true }),
    ]);
    const active =
      organizations.find(
        (organization) => organization.id === status.organizationId
      ) ??
      organizations.find(
        (organization) =>
          organization.id === session.session.activeOrganizationId
      ) ??
      organizations[0];

    if (!active) {
      // Idempotent on the server: a second tab gets the same workspace.
      const workspace = await rpc.gettingStarted.ensureWorkspace();
      // The cached (empty) organization list predates the new workspace.
      queryClient.removeQueries({
        queryKey: organizationQueryKeys.all(session.user.id),
      });
      queryClient.removeQueries({ queryKey: orpc.gettingStarted.key() });
      throw redirect({
        params: { org: workspace.organizationSlug },
        search: { guide: "setup" },
        to: "/$org",
      });
    }
    throw redirect({ params: { org: active.slug }, to: "/$org" });
  },
});
