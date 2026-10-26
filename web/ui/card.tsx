import { tv } from "@ui/tailwind";
import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

/**
 * The surface card shell. Presentational by default; pass `interactive` for
 * the hover treatment used by clickable cards.
 */
export const card = tv({
  base: "border-border bg-surface rounded-2xl border",
  defaultVariants: { interactive: false, padded: false },
  variants: {
    interactive: { false: "", true: "hover:bg-default-soft transition-colors" },
    padded: { false: "", true: "p-4" },
  },
});

type CardVariants = VariantProps<typeof card>;

export const Card = ({
  children,
  className,
  interactive,
  padded,
}: { children: ReactNode; className?: string } & CardVariants) => (
  <div className={card({ className, interactive, padded })}>{children}</div>
);
