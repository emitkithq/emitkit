import { cn } from "@ui/cn";
import type { ReactNode } from "react";

/** The site's column: 1200px wide, as the brand kit's own pages. */
export const Container = ({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) => (
  <div className={cn("mx-auto w-full max-w-[1200px] px-5 sm:px-8", className)}>
    {children}
  </div>
);
