import { ProjectsScreen } from "@app/features/projects/projects-screen";
import { usePageTitle } from "@app/lib/page-title";
import { createFileRoute } from "@tanstack/react-router";

const ProjectsPage = () => {
  const { org } = Route.useParams();
  const { organization } = Route.useRouteContext();
  usePageTitle("Projects", organization.name);
  return <ProjectsScreen org={org} />;
};

export const Route = createFileRoute("/$org/projects")({
  component: ProjectsPage,
});
