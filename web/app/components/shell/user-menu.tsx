import { CreateOrganizationDialog } from "@app/components/shell/create-organization-dialog";
import { ThemeSwitcher } from "@app/components/shell/theme-switcher";
import { authClient } from "@app/lib/auth-client";
import type { Viewer, WorkspaceOrganization } from "@app/lib/session";
import { Button, Popover, Spinner, toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Icon } from "@ui/icon";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";
import { useState } from "react";

const menuItemClassName =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-body text-foreground no-underline outline-none hover:bg-default-soft focus-visible:ring-2 focus-visible:ring-focus";

export const UserMenu = ({
  org,
  organizations,
  viewer,
}: {
  org: string;
  organizations: readonly WorkspaceOrganization[];
  viewer: Viewer;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const close = () => setIsOpen(false);

  const switchTo = async (slug: string) => {
    close();
    if (slug !== org) {
      await navigate({ params: { org: slug }, to: "/$org" });
    }
  };

  const signOut = async () => {
    setIsSigningOut(true);
    const { error } = await authClient.signOut();
    if (error) {
      setIsSigningOut(false);
      toast.danger("Sign out failed. Try again.");
      return;
    }
    close();
    await navigate({ href: "/auth/sign-in", replace: true });
    queryClient.clear();
  };

  return (
    <>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Button
          aria-label="Account menu"
          className="rounded-full"
          isIconOnly
          size="sm"
          variant="ghost"
        >
          <MemberAvatar
            hue="amber"
            initials={initialsFor(viewer.name, viewer.email)}
            size="sm"
          />
        </Button>
        <Popover.Content placement="bottom end">
          <Popover.Dialog className="border-border bg-overlay shadow-overlay w-64 rounded-xl border p-1.5">
            <p className="text-body text-foreground truncate px-2 pt-1.5 font-medium">
              {viewer.name || viewer.email}
            </p>
            <p className="text-meta text-muted truncate px-2 pb-1.5">
              {viewer.email}
            </p>
            <div className="border-separator my-1 border-t" />
            <p className="text-meta text-muted px-2 pt-1 pb-0.5">
              Organizations
            </p>
            <ul
              aria-label="Switch organization"
              className="flex max-h-56 flex-col overflow-y-auto"
            >
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <button
                    aria-current={
                      organization.slug === org ? "true" : undefined
                    }
                    className={menuItemClassName}
                    onClick={() => switchTo(organization.slug)}
                    type="button"
                  >
                    <MemberAvatar
                      className="rounded-md"
                      hue={hueFor(organization.id)}
                      image={organization.logo}
                      initials={initialsFor(organization.name)}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{organization.name}</span>
                    {organization.slug === org ? (
                      <Icon
                        className="text-accent-soft-foreground shrink-0"
                        name="check"
                        size={13}
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <button
              className={`${menuItemClassName} text-muted`}
              onClick={() => {
                close();
                setIsCreating(true);
              }}
              type="button"
            >
              <Icon className="shrink-0" name="plus" size={14} />
              Create organization
            </button>
            <div className="border-separator my-1 border-t" />
            <Link
              className={menuItemClassName}
              onClick={close}
              params={{ org }}
              to="/$org"
            >
              <Icon className="text-muted shrink-0" name="activity" size={14} />
              Events
            </Link>
            <Link
              className={menuItemClassName}
              onClick={close}
              params={{ org }}
              to="/$org/projects"
            >
              <Icon className="text-muted shrink-0" name="folder" size={14} />
              Projects
            </Link>
            <Link
              className={menuItemClassName}
              onClick={close}
              params={{ org }}
              to="/$org/channels"
            >
              <Icon className="text-muted shrink-0" name="hash" size={14} />
              Channels
            </Link>
            <Link
              className={menuItemClassName}
              onClick={close}
              search={(prev) => ({ ...prev, settings: "members" })}
              to="."
            >
              <Icon className="text-muted shrink-0" name="gear" size={14} />
              Settings
            </Link>
            <div className="border-separator my-1 border-t" />
            <Link
              className={menuItemClassName}
              onClick={close}
              search={(prev) => ({ ...prev, guide: "setup" })}
              to="."
            >
              <Icon className="text-muted shrink-0" name="spark" size={14} />
              Setup guide
            </Link>
            <Link
              className={menuItemClassName}
              onClick={close}
              search={(prev) => ({ ...prev, guide: "phone" })}
              to="."
            >
              <Icon
                className="text-muted shrink-0"
                name="smartphone"
                size={14}
              />
              Get it on your phone
            </Link>
            <div className="border-separator my-1 border-t" />
            <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2">
              <span className="text-body text-foreground">Theme</span>
              <ThemeSwitcher />
            </div>
            <div className="border-separator my-1 border-t" />
            <button
              className={menuItemClassName}
              disabled={isSigningOut}
              onClick={signOut}
              type="button"
            >
              {isSigningOut ? (
                <Spinner className="shrink-0" size="sm" />
              ) : (
                <Icon className="text-muted shrink-0" name="logout" size={14} />
              )}
              Sign out
            </button>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      <CreateOrganizationDialog
        isOpen={isCreating}
        onOpenChange={setIsCreating}
      />
    </>
  );
};
