import type { ReactNode } from "react";

export const SettingsSection = ({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title: string;
}) => (
  <section className="mb-7">
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-label text-foreground font-semibold">{title}</h2>
        {description ? (
          <p className="text-body text-muted mt-0.5 max-w-2xl leading-snug">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

export const SettingsCard = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`border-border bg-surface rounded-2xl border ${className ?? ""}`}
  >
    {children}
  </div>
);

export const SettingsRow = ({
  children,
  description,
  label,
}: {
  children?: ReactNode;
  description?: ReactNode;
  label: ReactNode;
}) => (
  <div className="border-separator flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0">
    <div className="min-w-[12rem] flex-1">
      <div className="text-body text-foreground">{label}</div>
      {description ? (
        <div className="text-meta text-muted mt-0.5 leading-snug">
          {description}
        </div>
      ) : null}
    </div>
    {children ? (
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    ) : null}
  </div>
);

/** A muted one-line message inside a settings card (loading, empty, error). */
export const SettingsNote = ({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "danger" | "muted";
}) => (
  <p
    className={`text-body px-4 py-3 ${tone === "danger" ? "text-danger" : "text-muted"}`}
  >
    {children}
  </p>
);
