import { cn } from "@ui/cn";
import type { ReactNode } from "react";

/**
 * A managed list (projects, channels): rows of cards on a tinted tray. A row
 * with `onPress` opens its item from its main area; `action` (usually a
 * `RowActions` menu) sits at the end, outside that area, as its own control.
 */
export const ListView = ({
  "aria-label": ariaLabel,
  children,
  className,
}: {
  "aria-label": string;
  children: ReactNode;
  className?: string;
}) => (
  <ul
    aria-label={ariaLabel}
    className={cn(
      "bg-surface-secondary flex w-full flex-col rounded-[calc(var(--radius)*2.5)] p-1",
      className
    )}
  >
    {children}
  </ul>
);

const itemContentClassName =
  "flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left text-sm";

const ListViewItem = ({
  action,
  children,
  className,
  onPress,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}) => (
  <li
    className={cn(
      "bg-surface border-separator-tertiary/50 flex items-center border-b transition-colors first:rounded-t-[calc(var(--radius)*2)] last:rounded-b-[calc(var(--radius)*2)] last:border-b-0",
      onPress && "hover:bg-surface/40",
      className
    )}
  >
    {onPress ? (
      <button
        className={cn(
          itemContentClassName,
          "cursor-(--cursor-interactive) self-stretch rounded-[inherit] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]",
          action ? "" : "pr-4"
        )}
        onClick={onPress}
        type="button"
      >
        {children}
      </button>
    ) : (
      <div className={cn(itemContentClassName, action ? "" : "pr-4")}>
        {children}
      </div>
    )}
    {action ? <div className="shrink-0 pr-4 pl-2">{action}</div> : null}
  </li>
);

const ListViewTitle = ({ children }: { children: ReactNode }) => (
  <span className="text-foreground truncate text-sm font-medium">
    {children}
  </span>
);

const ListViewDescription = ({ children }: { children: ReactNode }) => (
  <span className="text-muted mt-0.5 truncate text-xs">{children}</span>
);

ListView.Item = ListViewItem;
ListView.Title = ListViewTitle;
ListView.Description = ListViewDescription;
