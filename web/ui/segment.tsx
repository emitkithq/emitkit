import type { Key } from "@heroui/react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { cn } from "@ui/cn";
import type { ReactNode } from "react";

// The group's options sit flat on the pill; the chosen one is raised on
// `--segment` (the same token the Tabs indicator uses).
const segmentItemClassName = cn(
  "h-7 gap-1.5 rounded-3xl px-2.5 text-xs [&_svg]:size-4",
  "[--toggle-button-bg-hover:transparent] [--toggle-button-bg-pressed:transparent] [--toggle-button-bg:transparent] [--toggle-button-fg:var(--muted)]",
  "[--toggle-button-bg-selected-hover:var(--segment)] [--toggle-button-bg-selected-pressed:var(--segment)] [--toggle-button-bg-selected:var(--segment)] [--toggle-button-fg-selected:var(--segment-foreground)]",
  "data-[selected=true]:shadow-surface hover:not-data-[selected=true]:opacity-70"
);

/**
 * A segmented control: one choice out of a few, as a pill of options with
 * the chosen one raised. A HeroUI ToggleButtonGroup in single selection, so
 * it reads as a radio group (arrow keys move between options).
 */
export const Segment = <K extends Key>({
  "aria-label": ariaLabel,
  className,
  items,
  onSelectionChange,
  selectedKey,
}: {
  "aria-label": string;
  className?: string;
  items: readonly {
    "aria-label"?: string;
    content: ReactNode;
    id: K;
  }[];
  onSelectionChange: (key: K) => void;
  selectedKey: K;
}) => (
  <ToggleButtonGroup
    aria-label={ariaLabel}
    className={cn(
      "bg-default relative inline-flex items-center gap-0 rounded-[calc(var(--radius-2xl)+0.25rem)] p-0.5",
      className
    )}
    disallowEmptySelection
    onSelectionChange={(keys) => {
      const [key] = keys;
      if (key !== undefined) {
        onSelectionChange(key as K);
      }
    }}
    selectedKeys={new Set([selectedKey])}
    selectionMode="single"
  >
    {items.map((item) => (
      <ToggleButton
        aria-label={item["aria-label"]}
        className={segmentItemClassName}
        id={item.id}
        key={item.id}
      >
        {item.content}
      </ToggleButton>
    ))}
  </ToggleButtonGroup>
);
