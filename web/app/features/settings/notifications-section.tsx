import {
  SettingsCard,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@app/components/settings-primitives";
import { useDevicePush } from "@app/lib/device-push";
import { errorMessage } from "@app/lib/errors";
import { plural } from "@app/lib/format";
import { rpc } from "@app/lib/rpc";
import { Button, Spinner, Switch, toast } from "@heroui/react";
import type { PushPreferences } from "@shared/rpc/schemas";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@ui/badge";
import { Icon } from "@ui/icon";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";
import { useState } from "react";

type OrganizationPreference = PushPreferences["organizations"][number];

const channelCount = (organization: OrganizationPreference) =>
  organization.projects.reduce(
    (total, project) => total + project.channels.length,
    0
  );

const summary = (organization: OrganizationPreference) => {
  if (!organization.subscribed) {
    return "Off";
  }
  return organization.channelIds.length === 0
    ? "All channels"
    : `${plural(organization.channelIds.length, "channel")} of ${channelCount(organization)}`;
};

const OnOff = ({
  isDisabled,
  isSelected,
  label,
  onChange,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  label: string;
  onChange: (selected: boolean) => void;
}) => (
  <Switch
    aria-label={label}
    isDisabled={isDisabled}
    isSelected={isSelected}
    onChange={onChange}
    size="sm"
  >
    <Switch.Content>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch.Content>
  </Switch>
);

/** "All channels" or a picked set, grouped by project. */
const ChannelPicker = ({
  isBusy,
  onChange,
  organization,
}: {
  isBusy: boolean;
  onChange: (channelIds: readonly string[]) => void;
  organization: OrganizationPreference;
}) => {
  const everyChannel = organization.projects.flatMap((project) =>
    project.channels.map((channel) => channel.id)
  );
  const all = organization.channelIds.length === 0;
  const picked = new Set(organization.channelIds);
  if (everyChannel.length === 0) {
    return (
      <p className="text-meta text-muted px-4 pb-3">
        No channels yet. The first event that names a channel creates it, and
        it’s included here automatically.
      </p>
    );
  }
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    if (next.size === 0) {
      toast.warning(
        "Keep at least one channel, or switch the organization off."
      );
      return;
    }
    onChange([...next]);
  };
  return (
    <div className="px-4 pb-4" data-channel-picker>
      <fieldset className="border-border grid grid-cols-2 rounded-xl border p-1">
        <legend className="sr-only">Channels</legend>
        {[
          { id: "all", label: "All channels" },
          { id: "some", label: "Only some" },
        ].map((option) => {
          const selected = (option.id === "all") === all;
          return (
            <label
              className={`text-meta has-[:focus-visible]:ring-focus flex cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 has-[:focus-visible]:ring-2 ${
                selected
                  ? "bg-surface text-foreground shadow-surface font-medium"
                  : "text-muted hover:text-foreground"
              }`}
              key={option.id}
            >
              <input
                checked={selected}
                className="sr-only"
                disabled={isBusy}
                name={`scope-${organization.organizationId}`}
                onChange={() =>
                  onChange(option.id === "all" ? [] : everyChannel)
                }
                type="radio"
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>
      {all ? (
        <p className="text-meta text-muted mt-2">
          Every channel, including ones created later.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {organization.projects
            .filter((project) => project.channels.length > 0)
            .map((project) => (
              <div key={project.id}>
                <p className="text-meta text-muted mb-1.5">{project.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.channels.map((channel) => {
                    const on = picked.has(channel.id);
                    return (
                      <label
                        className={`text-meta has-[:focus-visible]:ring-focus flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 has-[:focus-visible]:ring-2 ${
                          on
                            ? "bg-accent-soft text-accent-soft-foreground border-[color:var(--accent)]"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                        key={channel.id}
                      >
                        <input
                          checked={on}
                          className="sr-only"
                          disabled={isBusy}
                          onChange={() => toggle(channel.id)}
                          type="checkbox"
                        />
                        {channel.icon ? <span>{channel.icon}</span> : null}#
                        {channel.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const OrganizationRow = ({
  isBusy,
  onChange,
  organization,
}: {
  isBusy: boolean;
  onChange: (enabled: boolean, channelIds: readonly string[]) => void;
  organization: OrganizationPreference;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="border-separator border-b last:border-b-0"
      data-organization={organization.organizationSlug}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <MemberAvatar
          className="rounded-md"
          hue={hueFor(organization.organizationId)}
          initials={initialsFor(organization.organizationName)}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-body text-foreground truncate">
            {organization.organizationName}
          </p>
          {organization.subscribed ? (
            <button
              aria-expanded={open}
              className="text-meta text-muted hover:text-foreground flex items-center gap-1"
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              {summary(organization)}
              <Icon
                className={`transition-transform ${open ? "rotate-180" : ""}`}
                name="chevron-down"
                size={12}
              />
            </button>
          ) : (
            <p className="text-meta text-muted">{summary(organization)}</p>
          )}
        </div>
        <OnOff
          isDisabled={isBusy}
          isSelected={organization.subscribed}
          label={`Notifications from ${organization.organizationName}`}
          onChange={(enabled) => onChange(enabled, [])}
        />
      </div>
      {organization.subscribed && open ? (
        <ChannelPicker
          isBusy={isBusy}
          onChange={(channelIds) => onChange(true, channelIds)}
          organization={organization}
        />
      ) : null}
    </li>
  );
};

const DeviceRow = ({ push }: { push: ReturnType<typeof useDevicePush> }) => {
  const test = useMutation({
    mutationFn: () => rpc.notifications.test(),
    onError: (error) =>
      toast.danger(
        errorMessage(error, "The test notification couldn't be sent.")
      ),
    onSuccess: ({ delivered }) => {
      if (delivered > 0) {
        toast.success(
          `Test notification sent to ${plural(delivered, "device")}`
        );
      } else {
        toast.warning(
          "Nothing was sent: this organization is switched off below."
        );
      }
    },
  });

  if (push.support === "ios-needs-install") {
    return (
      <SettingsRow
        description={
          <>
            On iPhone and iPad, notifications need the app: tap{" "}
            <Icon className="inline align-[-2px]" name="share" size={13} />{" "}
            Share, then{" "}
            <span className="text-foreground font-medium">
              Add to Home Screen
            </span>
            , and open EmitKit from there.
          </>
        }
        label="Install EmitKit to get notifications"
      />
    );
  }
  if (push.support === "unsupported") {
    return (
      <SettingsRow
        description="This browser can’t receive push notifications. Try Chrome, Edge, Firefox or Safari."
        label="Not supported in this browser"
      />
    );
  }
  if (push.isChecking) {
    return (
      <div className="grid place-items-center py-6">
        <Spinner aria-label="Checking this device" size="sm" />
      </div>
    );
  }
  if (push.loadError) {
    return (
      <SettingsNote tone="danger">
        {errorMessage(
          push.loadError,
          "Notification settings couldn’t be loaded."
        )}
      </SettingsNote>
    );
  }
  if (push.permission === "denied") {
    return (
      <SettingsRow
        description="Notifications are blocked for this site. Allow them in your browser’s site settings, then reload."
        label="Blocked in this browser"
      >
        <Badge tone="danger">Blocked</Badge>
      </SettingsRow>
    );
  }
  if (!push.isSubscribed) {
    return (
      <SettingsRow
        description="Turn them on once for this device, then choose what reaches it."
        label="Notifications are off on this device"
      >
        <Button
          isPending={push.isEnabling}
          onPress={() => push.enable()}
          size="sm"
        >
          <Icon name="bell" size={14} />
          Turn on
        </Button>
      </SettingsRow>
    );
  }
  return (
    <SettingsRow
      description="Events sent with “notify”: true arrive here from the organizations switched on below."
      label={
        <span className="flex items-center gap-2">
          This device <Badge tone="success">On</Badge>
        </span>
      }
    >
      <Button
        isPending={test.isPending}
        onPress={() => test.mutate()}
        size="sm"
        variant="secondary"
      >
        Send test
      </Button>
      <Button
        isDisabled={push.isBusy}
        isPending={push.isDisabling}
        onPress={() => push.disable()}
        size="sm"
        variant="ghost"
      >
        <Icon name="bell-off" size={14} />
        Turn off
      </Button>
    </SettingsRow>
  );
};

/**
 * Push notifications for this device, across every organization you belong
 * to: turn them on once, then switch organizations on or off and pick their
 * channels. The same app on another device has its own settings.
 */
export const NotificationsSection = () => {
  const push = useDevicePush();
  return (
    <>
      <SettingsSection
        description="Push notifications on this browser or the installed app."
        title="This device"
      >
        <SettingsCard>
          <DeviceRow push={push} />
        </SettingsCard>
      </SettingsSection>

      {push.isSubscribed ? (
        <SettingsSection
          description="Choose which organizations and channels reach this device."
          title="Organizations"
        >
          <SettingsCard>
            <ul aria-label="Organizations" className="m-0 list-none p-0">
              {push.organizations.map((organization) => (
                <OrganizationRow
                  isBusy={push.isBusy}
                  key={organization.organizationId}
                  onChange={(enabled, channelIds) =>
                    push.setOrganization({
                      channelIds,
                      enabled,
                      organizationId: organization.organizationId,
                    })
                  }
                  organization={organization}
                />
              ))}
            </ul>
          </SettingsCard>
        </SettingsSection>
      ) : null}
    </>
  );
};
