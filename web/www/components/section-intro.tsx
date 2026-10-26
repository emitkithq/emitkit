import { cn } from "@ui/cn";
import type { ReactNode } from "react";

/**
 * A section's opening: the kit's numbered mono label, a heading in the
 * brand's heading style and an optional lead paragraph.
 */
export const SectionIntro = ({
  children,
  className,
  id,
  number,
  label,
  title,
}: Readonly<{
  children?: ReactNode;
  className?: string;
  /** The heading's id, for the section's `aria-labelledby`. */
  id: string;
  label: string;
  number: string;
  title: ReactNode;
}>) => (
  <div className={cn("max-w-[620px]", className)}>
    <p className="text-meta m-0 font-mono">
      <span className="text-accent">{number}</span>
      <span className="text-muted"> · {label}</span>
    </p>
    <h2
      className="text-heading text-foreground m-0 mt-4 font-normal text-balance"
      id={id}
    >
      {title}
    </h2>
    {children ? (
      <p className="text-copy text-muted m-0 mt-4 text-pretty">{children}</p>
    ) : null}
  </div>
);
