import { cn } from "@ui/cn";
import type { CSSProperties } from "react";

/** Static patterns from `scripts/generate-patterns.ts` (`web/public/www/patterns`). */
export type HalftonePattern = "ripple-blue" | "ripple-white";

/**
 * A field of the kit's ripple pattern behind content, at its natural size.
 * `position` picks which part of the 1600×900 field shows, so sibling
 * surfaces can show different rings from the same file. Set strength with an
 * opacity class: the kit uses white at 60% on Emit Blue, 45% on Midnight.
 */
export const Halftone = ({
  className,
  pattern,
  position = "center",
}: Readonly<{
  className?: string;
  pattern: HalftonePattern;
  position?: CSSProperties["backgroundPosition"];
}>) => (
  <div
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute inset-0 bg-auto bg-no-repeat",
      className
    )}
    style={{
      backgroundImage: `url(/patterns/${pattern}.svg)`,
      backgroundPosition: position,
    }}
  />
);

/**
 * The kit's ping: halftone rings spreading from one point, like a
 * notification landing. Centred on its container's top-left corner, so
 * position the container where the notification lands. Two copies half a
 * cycle apart keep one ring always on its way out.
 */
export const Ping = ({ className }: Readonly<{ className?: string }>) => (
  <div
    aria-hidden="true"
    className={cn("pointer-events-none absolute size-0", className)}
  >
    {["ping", "ping ping-late"].map((motion) => (
      <img
        alt=""
        className={cn("absolute -top-[360px] -left-[360px] max-w-none", motion)}
        height={720}
        key={motion}
        src="/patterns/ping-white.svg"
        width={720}
      />
    ))}
  </div>
);

/** Film grain for a brand field or photo; place it before the field's content. */
export const Grain = ({ className }: Readonly<{ className?: string }>) => (
  <div aria-hidden="true" className={cn("grain absolute inset-0", className)} />
);
