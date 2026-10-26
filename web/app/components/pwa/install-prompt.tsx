import { isIos, isStandalone } from "@app/lib/device";
import { clearInstallPrompt, usePwaState } from "@app/lib/pwa";
import { Button } from "@heroui/react";
import { AppIcon } from "@ui/brand-mark";
import { Icon } from "@ui/icon";
import { useState } from "react";

const DISMISSED_KEY = "emitkit:install-prompt-dismissed";
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

const wasDismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
};

const rememberDismissal = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the prompt simply comes back next visit.
  }
};

/**
 * A small, dismissible card suggesting the installed app — through the
 * browser's own prompt where there is one, and with the Share → Add to Home
 * Screen steps on iPhone and iPad, where installing is what unlocks push.
 */
export const InstallPrompt = () => {
  const { installPrompt } = usePwaState();
  const [isDismissed, setIsDismissed] = useState(wasDismissedRecently);
  const showIosHint = !installPrompt && isIos() && !isStandalone();

  if (isDismissed || isStandalone() || !(installPrompt || showIosHint)) {
    return null;
  }

  const dismiss = () => {
    rememberDismissal();
    setIsDismissed(true);
  };

  const install = async () => {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    clearInstallPrompt();
    if (outcome === "dismissed") {
      dismiss();
    }
  };

  return (
    <aside
      aria-label="Install EmitKit"
      className="border-border bg-overlay shadow-overlay fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 z-40 mx-auto flex max-w-sm items-start gap-3 rounded-2xl border p-3.5 md:right-5 md:bottom-5 md:left-auto"
    >
      <AppIcon className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-body font-medium">Install EmitKit</p>
        {showIosHint ? (
          <p className="text-muted text-meta mt-0.5 leading-snug">
            Tap <Icon className="inline align-[-2px]" name="share" size={13} />{" "}
            Share, then{" "}
            <span className="text-foreground font-medium">
              Add to Home Screen
            </span>{" "}
            to get push notifications on this device.
          </p>
        ) : (
          <p className="text-muted text-meta mt-0.5 leading-snug">
            Open it like an app and get notifications as events happen.
          </p>
        )}
        {installPrompt ? (
          <Button className="mt-2.5" onPress={install} size="sm">
            <Icon name="download" size={14} />
            Install app
          </Button>
        ) : null}
      </div>
      <Button
        aria-label="Dismiss install suggestion"
        isIconOnly
        onPress={dismiss}
        size="sm"
        variant="ghost"
      >
        <Icon name="close" size={14} />
      </Button>
    </aside>
  );
};
