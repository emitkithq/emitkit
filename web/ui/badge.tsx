import { Chip } from "@heroui/react";
import type { ReactNode } from "react";

const COLORS = {
  accent: "accent",
  danger: "danger",
  neutral: "default",
  success: "success",
} as const;

/**
 * The small status/metadata pill (roles, "Disabled", "No events yet"): a
 * soft HeroUI Chip in sentence case. `tone` carries meaning, never
 * decoration: accent marks the current or owning one.
 */
export const Badge = ({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof COLORS;
}) => (
  <Chip className={className} color={COLORS[tone]} size="sm" variant="soft">
    {children}
  </Chip>
);
