import { BrandIcon } from "@app/components/brand-icon";
import { orpc } from "@app/lib/rpc";
import type { Selection } from "@heroui/react";
import { Button, Dropdown, Label } from "@heroui/react";
import { domainOfUrl } from "@shared/domains";
import type { Project } from "@shared/rpc/schemas";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@ui/icon";
import { hueFor } from "@ui/member-avatar";

const ALL = "all-projects";

/** A colored dot in a brand icon's 16px box, so labels line up either way. */
const Dot = ({ color }: { color: string }) => (
  <span
    aria-hidden="true"
    className="flex size-4 shrink-0 items-center justify-center"
  >
    <span className="size-2 rounded-full" style={{ background: color }} />
  </span>
);

const projectColor = (projectId: string) => `var(--orb-${hueFor(projectId)})`;

/** The project's brand icon (from its website), or its colored dot. */
const ProjectMark = ({ project }: { project: Project }) => (
  <BrandIcon
    className="size-4 rounded"
    domain={domainOfUrl(project.url)}
    fallback={<Dot color={projectColor(project.id)} />}
    size={16}
  />
);

/**
 * Which project the feed shows, next to the organization name. Switching
 * project clears the channel and search filters: they belonged to the old one.
 */
export const ProjectSwitcher = ({
  org,
  projectId,
}: {
  org: string;
  projectId: string | undefined;
}) => {
  const navigate = useNavigate();
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const live = (projects.data ?? []).filter((project) => !project.deletedAt);
  const current = live.find((project) => project.id === projectId);

  const select = (keys: Selection) => {
    const [key] = keys === "all" ? [] : [...keys];
    const next = key === undefined || key === ALL ? undefined : String(key);
    navigate({
      params: { org },
      search: next ? { projectId: next } : {},
      to: "/$org",
    });
  };

  return (
    <Dropdown>
      <Button
        aria-label={`Project: ${current?.name ?? "All projects"}`}
        className="text-foreground text-title min-w-0 gap-2 px-2.5 font-medium"
        size="sm"
        variant="ghost"
      >
        {current ? <ProjectMark project={current} /> : null}
        <span className="truncate">{current?.name ?? "All projects"}</span>
        <Icon className="text-muted shrink-0" name="chevron-down" size={14} />
      </Button>
      <Dropdown.Popover className="min-w-[240px]" placement="bottom start">
        <Dropdown.Menu
          aria-label="Projects"
          onSelectionChange={select}
          selectedKeys={new Set([current?.id ?? ALL])}
          selectionMode="single"
        >
          <Dropdown.Item id={ALL} textValue="All projects">
            <span aria-hidden="true" className="size-4 shrink-0" />
            <Label>All projects</Label>
            <Dropdown.ItemIndicator />
          </Dropdown.Item>
          {live.map((project) => (
            <Dropdown.Item
              id={project.id}
              key={project.id}
              textValue={project.name}
            >
              <ProjectMark project={project} />
              <Label>{project.name}</Label>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
