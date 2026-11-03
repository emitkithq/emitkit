import { ConsentScreen } from "@app/features/oauth/consent-screen";
import { usePageTitle } from "@app/lib/page-title";
import { requireSession, signOut } from "@app/lib/session";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Where the OAuth provider sends people to pick a project and approve an app
 * (ChatGPT, Claude, an MCP client). Its own page, outside the dashboard shell.
 */
const ConsentPage = () => {
  const { session } = Route.useRouteContext();
  const { queryClient } = Route.useRouteContext();
  const { search } = window.location;
  usePageTitle("Connect an app");
  return (
    <ConsentScreen
      email={session.user.email}
      onSwitchAccount={async () => {
        await signOut(queryClient);
        window.location.assign(`/auth/sign-in${search}`);
      }}
      search={search}
    />
  );
};

export const Route = createFileRoute("/oauth/consent")({
  async beforeLoad({ context: { queryClient }, location }) {
    const session = await requireSession(queryClient, location.href);
    return { session };
  },
  component: ConsentPage,
});
