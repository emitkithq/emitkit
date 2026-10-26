import { useCopy } from "@app/lib/use-copy";
import { Button } from "@heroui/react";
import { Icon } from "@ui/icon";

/**
 * A secret on screen (an API key, or a project's callback signing secret):
 * freshly minted, or revealed again by an owner or admin. It lives only in the
 * component state of whoever rendered this panel and is never cached or stored
 * in the browser.
 */
export const OneTimeSecret = ({
  copyLabel = "Copy API key",
  description = "Copy it into your secret manager. Owners and admins can reveal it again from Settings → API keys.",
  label = "API key secret",
  onDismiss,
  secret,
  title,
}: {
  /** The copy button's accessible name. */
  copyLabel?: string;
  description?: string;
  /** The secret's accessible name. */
  label?: string;
  onDismiss?: () => void;
  secret: string;
  title: string;
}) => {
  const { copied, copy } = useCopy();
  return (
    <div
      className="rounded-xl border border-[color-mix(in_oklab,var(--orb-violet)_32%,var(--border))] bg-[color-mix(in_oklab,var(--orb-violet)_6%,var(--surface))] px-3.5 py-3"
      data-testid="one-time-secret"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-body font-medium">{title}</p>
          <p className="text-muted text-meta mt-0.5">{description}</p>
        </div>
        {onDismiss ? (
          <Button onPress={onDismiss} size="sm" variant="tertiary">
            Done
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex items-stretch gap-2">
        <code
          aria-label={label}
          className="border-border bg-background text-foreground selection:bg-orb-violet text-body block min-w-0 flex-1 overflow-x-auto rounded-lg border px-3 py-2.5 font-mono whitespace-nowrap selection:text-white"
        >
          {secret}
        </code>
        <Button
          aria-label={copyLabel}
          onPress={() => copy("secret", secret)}
          size="md"
          variant="secondary"
        >
          <Icon name={copied === "secret" ? "check" : "copy"} size={14} />
          {copied === "secret" ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
};
