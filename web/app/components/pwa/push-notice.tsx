import { InstallPrompt } from "@app/components/pwa/install-prompt";
import { useDevicePush, useDevicePushHealth } from "@app/lib/device-push";
import { rememberEndpoint } from "@app/lib/push";
import { Button } from "@heroui/react";
import { Icon } from "@ui/icon";
import { useState } from "react";

const PushStopped = ({
  isBlocked,
  onDismiss,
}: {
  readonly isBlocked: boolean;
  readonly onDismiss: () => void;
}) => {
  const push = useDevicePush();
  return (
    <aside
      aria-label="Notifications stopped"
      className="border-border bg-overlay shadow-overlay fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 z-40 mx-auto flex max-w-sm items-start gap-3 rounded-2xl border p-3.5 md:right-5 md:bottom-5 md:left-auto"
    >
      <span className="bg-danger/10 text-danger flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Icon name="bell-off" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-body font-medium">
          {isBlocked
            ? "Notifications are blocked"
            : "Notifications stopped on this device"}
        </p>
        <p className="text-muted text-meta mt-0.5 leading-snug">
          {isBlocked
            ? "Allow notifications for EmitKit in this browser's or phone's settings to get events here again."
            : "This device lost its push registration, so events aren't reaching it. Turn notifications back on to keep getting them."}
        </p>
        {isBlocked ? null : (
          <Button
            className="mt-2.5"
            isPending={push.isEnabling}
            onPress={() => push.enable({ fresh: true })}
            size="sm"
          >
            Turn back on
          </Button>
        )}
      </div>
      <Button
        aria-label="Dismiss"
        isIconOnly
        onPress={onDismiss}
        size="sm"
        variant="ghost"
      >
        <Icon name="close" size={14} />
      </Button>
    </aside>
  );
};

/**
 * Says so when push stopped on a device where it was on (the browser dropped
 * its registration, or notifications were blocked in settings), since
 * someone relying on alerts would otherwise not notice until they missed
 * one. Dismissing "stopped" hides it until the app is opened again; dismissing
 * "blocked" is taken as blocking on purpose (Settings can't turn push off
 * while it's blocked), so it doesn't come back. Without a problem
 * this shows the install suggestion instead, so the two never stack.
 */
export const DeviceNotice = ({ userId }: { readonly userId: string }) => {
  const health = useDevicePushHealth(userId);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const state = health.data ?? "ok";

  if (state === "ok" || dismissed === state) {
    return <InstallPrompt />;
  }
  return (
    <PushStopped
      isBlocked={state === "blocked"}
      onDismiss={() => {
        if (state === "blocked") {
          rememberEndpoint(userId, null);
        }
        setDismissed(state);
      }}
    />
  );
};
