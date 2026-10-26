import { EventsScreen } from "@app/features/events/events-screen";
import type { EventFilters } from "@app/features/events/filters";
import { parseEventFilters } from "@app/features/events/filters";
import { usePageTitle } from "@app/lib/page-title";
import { createFileRoute } from "@tanstack/react-router";

const EventsPage = () => {
  const { organization } = Route.useRouteContext();
  usePageTitle("Events", organization.name);
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <EventsScreen
      filters={filters}
      onFiltersChange={(changed) =>
        // Replace rather than push: every filter change becoming a history
        // step would make the back button useless.
        navigate({
          replace: true,
          search: (previous) => parseEventFilters({ ...previous, ...changed }),
        })
      }
    />
  );
};

export const Route = createFileRoute("/$org/")({
  component: EventsPage,
  validateSearch: (search: Record<string, unknown>): EventFilters =>
    parseEventFilters(search),
});
