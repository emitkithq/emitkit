import type { ReactNode } from "react";

interface PageHeaderProps {
  actions?: ReactNode;
  subtitle?: string | undefined;
  title: ReactNode;
}

/** The title a workspace page opens with, aligned with the top bar. */
export const PageHeader = ({ actions, subtitle, title }: PageHeaderProps) => (
  <header className="max-w-page mx-auto flex w-full items-center gap-3 px-4 pt-8 pb-2">
    <div className="flex min-w-0 flex-1 items-baseline gap-2">
      <h1 className="text-foreground truncate text-xl font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <span className="text-muted text-body hidden truncate sm:inline">
          {subtitle}
        </span>
      ) : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    ) : null}
  </header>
);
