import { authClient } from "@app/lib/auth-client";
import { authUiBasePaths, authUiPlugins } from "@app/lib/auth-ui";
import { resetWorkspaceCaches } from "@app/lib/session";
import { AuthProvider } from "@better-auth-ui/heroui";
import { Toast } from "@heroui/react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback } from "react";

const currentOrganizationSlug = (router: AnyRouter): string | undefined => {
  const match = router.state.matches.find(
    (candidate) => candidate.routeId === "/$org"
  );
  const params = match?.params as { org?: string } | undefined;
  return params?.org;
};

interface Destination {
  href: string;
  resetsWorkspace: boolean;
}

/**
 * Better Auth UI links to its own `/account/*` and `/organization/*` pages.
 * The dashboard has neither: account and organization settings are sections
 * of the settings modal (`/$org?settings=<section>`), and "your
 * organizations" is whatever `/` resolves to.
 */
const translateAuthUiPath = (
  to: string,
  organizationSlug: string | undefined
): Destination => {
  const [pathname = ""] = to.split("?");
  const settings = (section: string) =>
    organizationSlug ? `/${organizationSlug}?settings=${section}` : "/";

  if (pathname === `${authUiBasePaths.settings}/organizations`) {
    // Where Better Auth UI goes after deleting or leaving an organization.
    return { href: "/", resetsWorkspace: true };
  }
  if (pathname.startsWith(`${authUiBasePaths.settings}/`)) {
    return { href: settings("account"), resetsWorkspace: false };
  }
  if (pathname.startsWith(`${authUiBasePaths.organization}/`)) {
    return {
      href: settings(pathname.endsWith("/people") ? "members" : "organization"),
      resetsWorkspace: false,
    };
  }
  return { href: to, resetsWorkspace: false };
};

export const Providers = ({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) => {
  const router = useRouter();

  const navigate = useCallback(
    async ({ replace, to }: { replace?: boolean; to: string }) => {
      const { href, resetsWorkspace } = translateAuthUiPath(
        to,
        currentOrganizationSlug(router)
      );
      if (resetsWorkspace) {
        await resetWorkspaceCaches(queryClient);
      }
      await router.navigate({ href, replace });
    },
    [queryClient, router]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        authClient={authClient}
        avatar={{ enabled: false }}
        basePaths={authUiBasePaths}
        baseURL={window.location.origin}
        emailAndPassword={{
          enabled: true,
          forgotPassword: true,
          minPasswordLength: 8,
        }}
        navigate={navigate}
        plugins={authUiPlugins}
        queryClient={queryClient}
        redirectTo="/"
      >
        {children}
        <Toast.Provider placement="bottom end" />
      </AuthProvider>
    </QueryClientProvider>
  );
};
