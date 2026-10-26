import { Chip } from "@heroui/react";
import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import type { ReactNode } from "react";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export type Trend = "down" | "neutral" | "up";

/** A change from the period before: its direction and how it reads ("12%", "New"). */
export interface Change {
  readonly label: string;
  readonly trend: Trend;
}

const TREND_COLORS = {
  down: "danger",
  neutral: "default",
  up: "success",
} as const;

/**
 * KPI tiles side by side on one surface, split by hairlines. Presentational
 * only: `PulseView` renders them, in the dashboard and in the homepage demo.
 */
export const KpiGroup = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "bg-surface shadow-surface flex overflow-hidden rounded-[calc(var(--radius)*2)]",
      className
    )}
  >
    {children}
  </div>
);

export const KpiSeparator = () => (
  <div aria-hidden="true" className="bg-separator my-4 w-px shrink-0" />
);

/** One figure: its title, value and change; `children` go underneath. */
export const Kpi = ({
  children,
  title,
  trend,
  value,
}: {
  children?: ReactNode;
  title: string;
  trend?: ReactNode;
  value: ReactNode;
}) => (
  <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
    <dl className="flex flex-1 flex-col gap-3">
      <dt className="text-muted mb-1 text-sm font-medium">{title}</dt>
      <dd className="grid flex-1 grid-cols-[1fr_auto] items-center gap-x-2">
        <span className="text-foreground text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {trend}
      </dd>
    </dl>
    {children}
  </div>
);

/** The change from the period before, as a soft chip with its direction. */
export const KpiTrend = ({ change }: { change: Change }) => (
  <Chip
    className="shrink-0"
    color={TREND_COLORS[change.trend]}
    size="sm"
    variant="soft"
  >
    {change.trend === "neutral" ? null : (
      <Icon
        className={cn("shrink-0", change.trend === "down" && "rotate-180")}
        name="arrow-up"
        size={12}
        strokeWidth={2}
      />
    )}
    <Chip.Label className="tabular-nums">{change.label}</Chip.Label>
  </Chip>
);

/**
 * A sparkline along the tile's bottom edge, faded at both ends. Decorative:
 * the value and trend above carry the figure.
 */
export const KpiChart = ({
  color,
  data,
}: {
  color: string;
  data: { value: number }[];
}) => {
  const gradient = `kpi-chart-${useId()}`;
  return (
    <div
      aria-hidden="true"
      className="-mx-4 mt-2 -mb-4 overflow-hidden mask-x-from-90% mask-x-to-100%"
    >
      <ResponsiveContainer height={48} width="100%">
        <AreaChart
          data={data}
          margin={{ bottom: 0, left: 0, right: 0, top: 4 }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            dataKey="value"
            fill={`url(#${gradient})`}
            isAnimationActive={false}
            stroke={color}
            strokeWidth={1.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
