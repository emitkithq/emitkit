import { EmptyState as EmptyStateRoot } from "@heroui/react";
import { Icon } from "@ui/icon";
import type { IconName } from "@ui/icon";
import { tv } from "@ui/tailwind";
import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

/**
 * The empty / fallback state, on HeroUI's EmptyState: an icon in a round
 * tile, a title, a line of explanation and an optional action, centered.
 *
 *   variant="centered"  fills its flex parent and centers (route/detail panes)
 *   variant="block"     centered contents in normal flow (e.g. an empty list)
 *   variant="dashed"    a bordered dashed box in normal flow (in-panel empties)
 */
export const emptyState = tv({
  base: "flex flex-col items-center gap-3 px-4 py-6 text-center",
  defaultVariants: { variant: "centered" },
  variants: {
    variant: {
      block: "",
      centered: "flex-1 justify-center",
      dashed: "border-border rounded-2xl border border-dashed px-6 py-10",
    },
  },
});

type EmptyStateVariants = VariantProps<typeof emptyState>;

export const EmptyState = ({
  action,
  className,
  description,
  icon,
  title,
  variant,
}: {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: IconName;
  title?: ReactNode;
} & EmptyStateVariants) => (
  <EmptyStateRoot className={emptyState({ className, variant })}>
    <div className="flex flex-col items-center gap-2">
      {icon ? (
        <div className="bg-default text-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
          <Icon name={icon} size={16} />
        </div>
      ) : null}
      {title ? (
        <h3 className="text-label text-foreground font-medium">{title}</h3>
      ) : null}
      {description ? (
        <p className="text-body text-muted max-w-sm leading-snug">
          {description}
        </p>
      ) : null}
    </div>
    {action ? (
      <div className="flex flex-col items-center gap-2">{action}</div>
    ) : null}
  </EmptyStateRoot>
);
