import { PulseView } from "@app/features/events/pulse-view";
import { orpc } from "@app/lib/rpc";
import type { PulseRange } from "@shared/rpc/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

/**
 * How often the pulse is re-read. The feed already refreshes it when events
 * arrive; this interval only keeps totals honest while nothing arrives.
 * Longer ranges read Analytics Engine, so they refresh less often.
 */
const REFRESH_MS: Record<PulseRange, number> = {
  "24h": 60_000,
  "30d": 300_000,
  "7d": 300_000,
};

/**
 * The scope's pulse: events, and revenue when events carry money (see
 * `@shared/event-value`), over 24 hours, 7 or 30 days, each compared with
 * the period before.
 */
export const PulseCard = ({
  channelId,
  projectId,
}: {
  channelId: string | undefined;
  projectId: string | undefined;
}) => {
  const [range, setRange] = useState<PulseRange>("24h");
  const pulse = useQuery({
    ...orpc.events.pulse.queryOptions({
      input: {
        range,
        ...(channelId ? { channelId } : {}),
        ...(projectId ? { projectId } : {}),
      },
    }),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS[range],
  });

  return <PulseView data={pulse.data} onRangeChange={setRange} range={range} />;
};
