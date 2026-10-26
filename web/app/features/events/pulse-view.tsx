import {
  Kpi,
  KpiChart,
  KpiGroup,
  KpiSeparator,
  KpiTrend,
} from "@app/features/events/kpi";
import type { Change } from "@app/features/events/kpi";
import { formatNumber } from "@app/lib/format";
import type { Pulse, PulseRange } from "@shared/rpc/schemas";
import { Segment } from "@ui/segment";

export const RANGES: readonly {
  id: PulseRange;
  label: string;
  versus: string;
}[] = [
  { id: "24h", label: "24H", versus: "vs. the 24 hours before" },
  { id: "7d", label: "7D", versus: "vs. the week before" },
  { id: "30d", label: "30D", versus: "vs. the 30 days before" },
];

/** The change from the period before; none when both are zero. */
const trendOf = (current: number, previous: number): Change | null => {
  if (previous === 0) {
    return current === 0 ? null : { label: "New", trend: "up" };
  }
  const change = (current - previous) / Math.abs(previous);
  const percent = Math.round(Math.abs(change) * 100);
  if (percent === 0) {
    return { label: "0%", trend: "neutral" };
  }
  return { label: `${percent}%`, trend: change > 0 ? "up" : "down" };
};

/** Holds a chart's height while there is nothing to draw. */
const ChartSpace = () => <div aria-hidden="true" className="h-12" />;

const Placeholder = () => (
  <span className="text-muted text-2xl leading-none font-semibold">—</span>
);

/** Revenue: money carried by events, or how to start sending it. */
const RevenueKpi = ({ data }: { data: Pulse | undefined }) => {
  const value = data?.value;
  const valueTrend = value && trendOf(value.current, value.previous);
  return (
    <Kpi
      title="Revenue"
      trend={valueTrend ? <KpiTrend change={valueTrend} /> : null}
      value={
        value ? (
          formatNumber(value.current, {
            currency: value.currency,
            maximumFractionDigits: 0,
            style: "currency",
          })
        ) : (
          <Placeholder />
        )
      }
    >
      {data && !value ? (
        <p className="text-caption text-muted">
          Send <code className="font-mono">amount</code> and{" "}
          <code className="font-mono">currency</code> in an event’s metadata to
          track revenue.
        </p>
      ) : null}
      {value ? (
        <KpiChart
          color="var(--color-success)"
          data={(data?.points ?? []).map((point) => ({
            value: point.value,
          }))}
        />
      ) : null}
      {data ? null : <ChartSpace />}
    </Kpi>
  );
};

/**
 * The pulse as the dashboard draws it: events, and revenue when events carry
 * money, over the chosen range, each compared with the period before.
 * `data` is undefined while it loads. The dashboard feeds it from the API
 * (`PulseCard`); the marketing site's demo feeds it fixed data.
 */
export const PulseView = ({
  data,
  onRangeChange,
  range,
}: {
  data: Pulse | undefined;
  onRangeChange: (range: PulseRange) => void;
  range: PulseRange;
}) => {
  const events = data && trendOf(data.events.current, data.events.previous);
  const versus = RANGES.find((item) => item.id === range)?.versus;
  // A flat line at zero would only trace the card's bottom edge.
  const hasEvents = (data?.points ?? []).some((point) => point.events > 0);

  return (
    <section aria-label="Pulse" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta text-muted">{versus}</p>
        <Segment
          aria-label="Time range"
          items={RANGES.map((item) => ({ content: item.label, id: item.id }))}
          onSelectionChange={onRangeChange}
          selectedKey={range}
        />
      </div>
      <KpiGroup className="rounded-3xl">
        <Kpi
          title="Events"
          trend={events ? <KpiTrend change={events} /> : null}
          value={
            data ? (
              formatNumber(data.events.current, { maximumFractionDigits: 0 })
            ) : (
              <Placeholder />
            )
          }
        >
          {hasEvents ? (
            <KpiChart
              color="var(--chart-events)"
              data={(data?.points ?? []).map((point) => ({
                value: point.events,
              }))}
            />
          ) : (
            <ChartSpace />
          )}
        </Kpi>
        <KpiSeparator />
        <RevenueKpi data={data} />
      </KpiGroup>
    </section>
  );
};
