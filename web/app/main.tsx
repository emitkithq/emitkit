import "@ui/styles.css";
import {
  RouteError,
  RouteNotFound,
  RoutePending,
} from "@app/components/route-states";
import { mirrorInertToAriaHidden } from "@app/lib/inert-mirror";
import { startPwa } from "@app/lib/pwa";
import { createQueryClient, watchRpcErrors } from "@app/lib/query-client";
import { signInHref } from "@app/lib/session";
import { startTheme } from "@app/lib/theme";
import { watchVisitor } from "@app/lib/visitor";
import { routeTree } from "@app/route-tree.gen";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { trackPageView } from "@ui/visits";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const queryClient = createQueryClient();

const router = createRouter({
  context: { queryClient },
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 150,
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

watchRpcErrors(queryClient, {
  onMissingWorkspace() {
    if (router.state.location.pathname !== "/") {
      router.navigate({ to: "/" });
    }
  },
  onUnauthorized() {
    const { href, pathname } = router.state.location;
    if (pathname.startsWith("/auth/")) {
      return;
    }
    queryClient.clear();
    router.navigate({ href: signInHref(href), replace: true });
  },
});

watchVisitor(queryClient);
router.subscribe("onResolved", trackPageView);

startTheme();
startPwa();
mirrorInertToAriaHidden();

const root = document.querySelector<HTMLElement>("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
