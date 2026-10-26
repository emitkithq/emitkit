import { Providers } from "@app/components/providers";
import { UpdateNotifier } from "@app/components/pwa/update-notifier";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
}

const RootComponent = () => {
  const { queryClient } = Route.useRouteContext();
  return (
    <Providers queryClient={queryClient}>
      <Outlet />
      <UpdateNotifier />
    </Providers>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});
