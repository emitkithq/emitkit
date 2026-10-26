import { AppIcon } from "@ui/brand-mark";
import { cn } from "@ui/cn";
import type { CSSProperties } from "react";

/**
 * A push notification as a phone or desktop shows it: the event's title
 * over its description, which is exactly what EmitKit sends. Announced as
 * one labelled figure so screen readers hear the notification, not its parts.
 * `compact` drops the app-name row and shrinks it for tight stacks.
 */
export const PushCard = ({
  body,
  bodyLines = 2,
  className,
  compact = false,
  style,
  time = "now",
  title,
}: Readonly<{
  body: string;
  /** Lines of description before it truncates; stacked cards need one. */
  bodyLines?: 1 | 2;
  className?: string;
  compact?: boolean;
  style?: CSSProperties;
  time?: string;
  title: string;
}>) => (
  <figure
    aria-label={`Push notification: ${title}. ${body}`}
    className={cn(
      "shadow-float m-0 flex items-center border border-white/70 bg-white/85 text-left backdrop-blur-xl",
      compact
        ? "gap-2.5 rounded-[14px] px-2.5 py-2"
        : "gap-3 rounded-[22px] p-3.5 pr-4",
      className
    )}
    style={style}
  >
    <AppIcon className={cn("shrink-0", compact ? "size-7" : "size-10")} />
    <span aria-hidden="true" className="min-w-0 flex-1">
      {compact ? null : (
        <span className="text-meta text-graphite flex items-baseline justify-between gap-3">
          <span>EmitKit</span>
          <span>{time}</span>
        </span>
      )}
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-ink block truncate font-semibold",
            compact ? "text-body leading-snug" : "text-label"
          )}
        >
          {title}
        </span>
        {compact ? (
          <span className="text-caption text-graphite shrink-0">{time}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-ink/75 block",
          compact ? "text-meta" : "text-body",
          bodyLines === 1 ? "truncate" : "line-clamp-2"
        )}
      >
        {body}
      </span>
    </span>
  </figure>
);
