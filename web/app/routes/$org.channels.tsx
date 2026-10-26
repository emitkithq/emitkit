import { ChannelsScreen } from "@app/features/channels/channels-screen";
import { usePageTitle } from "@app/lib/page-title";
import { createFileRoute } from "@tanstack/react-router";

interface ChannelsSearch {
  projectId?: string;
}

const ChannelsPage = () => {
  const { org } = Route.useParams();
  const { organization } = Route.useRouteContext();
  usePageTitle("Channels", organization.name);
  const { projectId } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ChannelsScreen
      onProjectChange={(next) =>
        navigate({
          replace: true,
          search: (previous) => {
            const { projectId: _previous, ...rest } = previous;
            return next ? { ...rest, projectId: next } : rest;
          },
        })
      }
      org={org}
      projectId={projectId}
    />
  );
};

export const Route = createFileRoute("/$org/channels")({
  component: ChannelsPage,
  validateSearch: (search: Record<string, unknown>): ChannelsSearch =>
    typeof search.projectId === "string" && search.projectId
      ? { projectId: search.projectId }
      : {},
});
