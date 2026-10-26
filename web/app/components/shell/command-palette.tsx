import { orpc } from "@app/lib/rpc";
import type { WorkspaceOrganization } from "@app/lib/session";
import type { SettingsSectionId } from "@app/lib/settings-sections";
import { settingsSectionItem } from "@app/lib/settings-sections";
import {
  Autocomplete,
  Header,
  Menu,
  Modal,
  SearchField,
  useFilter,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import type { IconName } from "@ui/icon";
import { Icon } from "@ui/icon";
import { useMemo } from "react";

interface PaletteItem {
  detail?: string | undefined;
  icon: IconName;
  id: string;
  label: string;
  link: LinkProps;
}

interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

// Settings open over the current page, like the user menu's links.
const settings = (section: SettingsSectionId, label?: string): PaletteItem => {
  const item = settingsSectionItem(section);
  return {
    icon: item.icon,
    id: `settings-${section}`,
    label: label ?? item.label,
    link: { search: (prev) => ({ ...prev, settings: section }), to: "." },
  };
};

const pageDestinations = (org: string): PaletteItem[] => {
  const params = { org };
  return [
    {
      icon: "activity",
      id: "events",
      label: "Events",
      link: { params, to: "/$org" },
    },
    {
      icon: "folder",
      id: "projects",
      label: "Projects",
      link: { params, to: "/$org/projects" },
    },
    {
      icon: "hash",
      id: "channels",
      label: "Channels",
      link: { params, to: "/$org/channels" },
    },
    settings("api-keys"),
    settings("members"),
    settings("notifications"),
    settings("organization", "Organization settings"),
    settings("account", "Account settings"),
  ];
};

/**
 * The ⌘K palette: every place the workspace can take you (pages, projects,
 * channels, other organizations) in one filtered list. A HeroUI Modal around
 * an Autocomplete: typing filters the menu, arrow keys move through it while
 * focus stays in the search field, and Enter goes.
 */
export const CommandPalette = ({
  isOpen,
  onOpenChange,
  org,
  organizations,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  org: string;
  organizations: readonly WorkspaceOrganization[];
}) => {
  const navigate = useNavigate();
  const { contains } = useFilter({ sensitivity: "base" });
  const projects = useQuery({
    ...orpc.projects.list.queryOptions({ input: {} }),
    enabled: isOpen,
  });
  const channels = useQuery({
    ...orpc.channels.list.queryOptions({ input: {} }),
    enabled: isOpen,
  });

  const groups = useMemo((): PaletteGroup[] => {
    const liveProjects = (projects.data ?? []).filter(
      (project) => !project.deletedAt
    );
    const projectNames = new Map(
      liveProjects.map((project) => [project.id, project.name])
    );
    return [
      { heading: "Go to", items: pageDestinations(org) },
      {
        heading: "Projects",
        items: liveProjects.map((project) => ({
          detail: "Events",
          icon: "folder",
          id: `project-${project.id}`,
          label: project.name,
          link: {
            params: { org },
            search: { projectId: project.id },
            to: "/$org",
          },
        })),
      },
      {
        heading: "Channels",
        items: (channels.data ?? [])
          .filter((channel) => projectNames.has(channel.projectId))
          .map((channel) => ({
            detail: projectNames.get(channel.projectId),
            icon: "hash",
            id: `channel-${channel.id}`,
            label: `${channel.icon ? `${channel.icon} ` : ""}${channel.name}`,
            link: {
              params: { org },
              search: { channelId: channel.id, projectId: channel.projectId },
              to: "/$org",
            },
          })),
      },
      {
        heading: "Switch organization",
        items: organizations
          .filter((organization) => organization.slug !== org)
          .map((organization) => ({
            icon: "building",
            id: `org-${organization.id}`,
            label: organization.name,
            link: { params: { org: organization.slug }, to: "/$org" },
          })),
      },
    ].filter((group) => group.items.length > 0) as PaletteGroup[];
  }, [channels.data, org, organizations, projects.data]);

  const go = async (item: PaletteItem) => {
    onOpenChange(false);
    await navigate(item.link);
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
      <Modal.Container
        className="w-full px-4 pt-[15vh] pb-4 sm:w-full sm:px-4 sm:pt-[15vh]"
        placement="top"
      >
        <Modal.Dialog
          aria-label="Search EmitKit"
          className="flex max-h-[min(80vh,440px)] w-full max-w-xl flex-col overflow-hidden rounded-[calc(var(--radius)*2)] p-0"
        >
          <Autocomplete.Filter filter={contains}>
            <SearchField
              aria-label="Search pages, projects and channels"
              autoFocus
              className="border-border/70 w-full border-b"
            >
              <SearchField.Group className="h-auto gap-2 rounded-none border-0 bg-transparent pr-2 pl-4 shadow-none focus-within:ring-0 hover:bg-transparent data-[focus-within=true]:ring-0">
                <Icon className="text-muted shrink-0" name="search" size={16} />
                <SearchField.Input
                  className="text-foreground placeholder:text-muted px-0 py-3 text-sm"
                  placeholder="Search pages, projects and channels…"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Menu
              aria-label="Results"
              className="flex-1 gap-0 overflow-y-auto overscroll-contain p-1.5 outline-none"
              renderEmptyState={() => (
                <p className="text-muted text-label px-3 py-8 text-center">
                  Nothing matched.
                </p>
              )}
            >
              {groups.map((group) => (
                <Menu.Section
                  className="items-stretch not-first:mt-1"
                  key={group.heading}
                >
                  <Header className="text-muted px-3 py-1.5 text-xs font-medium select-none">
                    {group.heading}
                  </Header>
                  {group.items.map((item) => (
                    <Menu.Item
                      className="text-foreground data-[focused=true]:bg-default min-h-0 gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm data-[focus-visible=true]:ring-0"
                      id={item.id}
                      key={item.id}
                      onAction={() => go(item)}
                      textValue={`${item.label} ${item.detail ?? ""} ${group.heading}`}
                    >
                      <Icon
                        className="text-muted shrink-0"
                        name={item.icon}
                        size={16}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.detail ? (
                        <span className="text-muted text-meta truncate">
                          {item.detail}
                        </span>
                      ) : null}
                    </Menu.Item>
                  ))}
                </Menu.Section>
              ))}
            </Menu>
          </Autocomplete.Filter>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
