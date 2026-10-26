import { CommandPalette } from "@app/components/shell/command-palette";
import { ProjectSwitcher } from "@app/components/shell/project-switcher";
import { UserMenu } from "@app/components/shell/user-menu";
import { authClient } from "@app/lib/auth-client";
import type { Viewer, WorkspaceOrganization } from "@app/lib/session";
import { useSession } from "@better-auth-ui/react";
import { useListOrganizations } from "@better-auth-ui/react/plugins/organization";
import { Button, Tooltip } from "@heroui/react";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { Icon } from "@ui/icon";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

const useWorkspaceOrganizations = (
  fallback: readonly WorkspaceOrganization[]
) => {
  const { data } = useListOrganizations(authClient);
  return useMemo(
    () =>
      data
        ? data.flatMap((organization) =>
            organization.slug
              ? [
                  {
                    id: organization.id,
                    ...(organization.logo ? { logo: organization.logo } : {}),
                    name: organization.name,
                    slug: organization.slug,
                  },
                ]
              : []
          )
        : fallback,
    [data, fallback]
  );
};

/**
 * The chrome every organization route sits inside: one slim top bar (the
 * organization, the project switcher on the feed, search, the user menu)
 * above the page. The window scrolls; the bar stays. Projects and settings
 * are reached from the user menu and ⌘K.
 */
export const WorkspaceShell = ({
  children,
  organization: initialOrganization,
  organizations: initialOrganizations,
  viewer,
}: {
  children: ReactNode;
  organization: WorkspaceOrganization;
  organizations: readonly WorkspaceOrganization[];
  viewer: Viewer;
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const search = useSearch({ strict: false }) as { projectId?: unknown };
  const org = initialOrganization.slug;
  const organizations = useWorkspaceOrganizations(initialOrganizations);
  // The list is kept fresh (renames, a brand's logo); the route's copy isn't.
  const organization =
    organizations.find(
      (candidate) => candidate.id === initialOrganization.id
    ) ?? initialOrganization;
  const { data: session } = useSession(authClient);
  const currentViewer = session?.user ?? viewer;
  const isFeed = pathname === `/${org}` || pathname === `/${org}/`;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header
        className="bg-background sticky top-0 z-20 pt-[env(safe-area-inset-top)]"
        data-app-header
      >
        <div className="max-w-page mx-auto flex h-14 w-full items-center gap-1 px-4">
          <Link
            className="hover:bg-default-soft flex min-w-0 shrink items-center gap-2 rounded-lg py-1 pr-1.5 pl-0.5 no-underline"
            params={{ org }}
            to="/$org"
          >
            <MemberAvatar
              className="rounded-lg"
              hue={hueFor(organization.id)}
              image={organization.logo}
              initials={initialsFor(organization.name)}
              size="md"
            />
            <span className="text-foreground text-title truncate font-semibold">
              {organization.name}
            </span>
          </Link>
          {isFeed ? (
            <>
              <span aria-hidden="true" className="text-border">
                /
              </span>
              <ProjectSwitcher
                org={org}
                projectId={
                  typeof search.projectId === "string"
                    ? search.projectId
                    : undefined
                }
              />
            </>
          ) : null}
          <span className="flex-1" />
          {isFeed ? (
            <span
              className="text-meta text-muted mr-1.5 hidden items-center gap-2 sm:flex"
              title="New events appear as they arrive"
            >
              <span className="live-dot" />
              Live
            </span>
          ) : null}
          <Tooltip delay={400}>
            <Button
              aria-keyshortcuts="Meta+K"
              aria-label="Search"
              className="text-muted"
              isIconOnly
              onPress={() => setIsSearchOpen(true)}
              size="sm"
              variant="ghost"
            >
              <Icon name="search" size={15} />
            </Button>
            <Tooltip.Content>Search (⌘K)</Tooltip.Content>
          </Tooltip>
          <UserMenu
            org={org}
            organizations={organizations}
            viewer={currentViewer}
          />
        </div>
      </header>

      <main className="pb-[env(safe-area-inset-bottom)]">{children}</main>

      <CommandPalette
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        org={org}
        organizations={organizations}
      />
    </div>
  );
};
