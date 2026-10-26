import { BillingSection } from "@app/features/billing/billing-section";
import { AccountSection } from "@app/features/settings/account-section";
import { ApiKeysSection } from "@app/features/settings/api-keys-section";
import { MembersSection } from "@app/features/settings/members-section";
import { NotificationsSection } from "@app/features/settings/notifications-section";
import { OrganizationSection } from "@app/features/settings/organization-section";
import { orpc } from "@app/lib/rpc";
import type { Viewer, WorkspaceOrganization } from "@app/lib/session";
import type { SettingsSectionId } from "@app/lib/settings-sections";
import {
  settingsSectionGroups,
  settingsSectionItem,
} from "@app/lib/settings-sections";
import { Modal } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Icon } from "@ui/icon";
import { useState } from "react";

const SectionContent = ({
  organization,
  org,
  section,
  viewer,
}: {
  org: string;
  organization: WorkspaceOrganization;
  section: SettingsSectionId;
  viewer: Viewer;
}) => {
  const workspace = useQuery(orpc.workspace.current.queryOptions());
  const canManage =
    workspace.data?.role === "owner" || workspace.data?.role === "admin";
  switch (section) {
    case "api-keys": {
      return (
        <ApiKeysSection canManage={canManage} key={organization.id} org={org} />
      );
    }
    case "billing": {
      return <BillingSection key={organization.id} />;
    }
    case "notifications": {
      return <NotificationsSection key={organization.id} />;
    }
    case "organization": {
      return (
        <OrganizationSection
          canManage={canManage}
          key={organization.id}
          organization={organization}
        />
      );
    }
    case "account": {
      return <AccountSection viewer={viewer} />;
    }
    default: {
      return (
        <MembersSection
          key={organization.id}
          organizationId={organization.id}
        />
      );
    }
  }
};

/**
 * Every setting, in one modal over whatever page is open: sections on the
 * left (a scrolling row on phones), the open one on the right. The URL's
 * `settings` search param says which section is open, so a section is a
 * link; each nav item replaces the param, and closing removes it.
 */
export const SettingsModal = ({
  onClose,
  org,
  organization,
  section,
  viewer,
}: {
  onClose: () => void;
  org: string;
  organization: WorkspaceOrganization;
  section: SettingsSectionId | undefined;
  viewer: Viewer;
}) => {
  // Keep the last section on screen while the modal animates out.
  const [shown, setShown] = useState(section);
  if (section && section !== shown) {
    setShown(section);
  }
  const current = settingsSectionItem(section ?? shown ?? "members");

  return (
    <Modal.Backdrop
      isOpen={section !== undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <Modal.Container className="p-0 sm:p-10" placement="center">
        <Modal.Dialog
          aria-label="Settings"
          className="h-full max-w-none rounded-none p-0 sm:h-[min(720px,calc(var(--visual-viewport-height)-5rem))] sm:w-[min(960px,calc(100vw-5rem))] sm:rounded-[28px]"
        >
          <div className="flex h-full min-h-0 flex-col sm:flex-row">
            <nav
              aria-label="Settings sections"
              className="border-separator bg-default-soft/60 flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto border-b px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:w-[228px] sm:flex-col sm:gap-4 sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-4"
            >
              {settingsSectionGroups.map((group) => (
                <div
                  className="flex shrink-0 gap-1 sm:flex-col sm:gap-0.5"
                  key={group.label}
                >
                  <p className="text-meta text-muted hidden px-2.5 pb-1 sm:block">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const isCurrent = item.value === current.value;
                    return (
                      <Link
                        aria-current={isCurrent ? "page" : undefined}
                        className={`text-body focus-visible:ring-focus flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-1.5 no-underline outline-none focus-visible:ring-2 ${
                          isCurrent
                            ? "bg-surface text-foreground shadow-surface font-medium"
                            : "text-muted hover:bg-default-soft hover:text-foreground"
                        }`}
                        key={item.value}
                        // On phones the nav is a scrolling row: keep the
                        // open section in view.
                        ref={
                          isCurrent
                            ? (link) =>
                                link?.scrollIntoView({
                                  block: "nearest",
                                  inline: "nearest",
                                })
                            : undefined
                        }
                        replace
                        search={(prev) => ({ ...prev, settings: item.value })}
                        to="."
                      >
                        <Icon className="shrink-0" name={item.icon} size={15} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-5 sm:px-7 sm:pt-6">
                <Modal.Heading className="text-title text-foreground flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="text-muted hidden sm:inline">Settings</span>
                  <Icon
                    className="text-muted hidden sm:inline"
                    name="chevron-right"
                    size={14}
                  />
                  <span className="truncate font-medium">{current.label}</span>
                </Modal.Heading>
                <Modal.CloseTrigger className="static" />
              </header>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7"
                data-settings-content
              >
                <SectionContent
                  org={org}
                  organization={organization}
                  section={current.value}
                  viewer={viewer}
                />
              </div>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
