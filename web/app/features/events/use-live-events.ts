import type { EventFilters } from "@app/features/events/filters";
import type { EventPages } from "@app/features/events/queries";
import {
  eventQueryInput,
  eventsInfiniteOptions,
  LIVE_INTERVAL_MS,
  LIVE_PAGE_SIZE,
  prependEvents,
} from "@app/features/events/queries";
import { rpc } from "@app/lib/rpc";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type EventInput = ReturnType<typeof eventQueryInput>;

const NO_ARRIVALS: ReadonlySet<string> = new Set();

/**
 * One live tick: the ids of events that arrived since the newest one shown.
 *
 * Note: with nothing on screen there is no server timestamp to poll from (and
 * the client clock is not one), so an empty feed is simply refetched. A burst
 * bigger than one poll resets the feed rather than leaving a gap.
 */
const pollNewEvents = async (
  queryClient: QueryClient,
  queryKey: QueryKey,
  input: EventInput
): Promise<string[]> => {
  const state = queryClient.getQueryState<EventPages>(queryKey);
  if (!state || state.fetchStatus === "fetching") {
    return [];
  }
  const newest = state.data?.pages[0]?.events[0]?.createdAt;
  if (!newest) {
    await queryClient.refetchQueries({ exact: true, queryKey });
    return [];
  }
  const page = await rpc.events.list({
    ...input,
    limit: LIVE_PAGE_SIZE,
    since: newest,
  });
  if (page.events.length >= LIVE_PAGE_SIZE) {
    await queryClient.resetQueries({ exact: true, queryKey });
    return [];
  }
  queryClient.setQueryData<EventPages>(queryKey, (data) =>
    prependEvents(data, page.events)
  );
  return page.events.map((event) => event.id);
};

/**
 * While live, asks for events newer than the newest one on screen every few
 * seconds and prepends them. Returns the ids that arrived this way, so rows
 * can announce themselves.
 */
export const useLiveEvents = ({
  filters,
  isLive,
}: {
  filters: EventFilters;
  isLive: boolean;
}): ReadonlySet<string> => {
  const queryClient = useQueryClient();
  const filterKey = JSON.stringify(eventQueryInput(filters));
  // Arrivals belong to the question that produced them; a new filter starts clean.
  const [arrived, setArrived] = useState<{
    ids: ReadonlySet<string>;
    key: string;
  }>({ ids: NO_ARRIVALS, key: filterKey });

  useEffect(() => {
    if (!isLive) {
      return;
    }
    const input = JSON.parse(filterKey) as EventInput;
    const { queryKey } = eventsInfiniteOptions(input);
    let isCancelled = false;
    let isPolling = false;

    const tick = async () => {
      if (isPolling || document.hidden) {
        return;
      }
      isPolling = true;
      let ids: string[] = [];
      try {
        ids = await pollNewEvents(queryClient, queryKey, input);
      } catch {
        // Transient; the next tick tries again.
      }
      isPolling = false;
      if (!isCancelled && ids.length > 0) {
        setArrived({ ids: new Set(ids), key: filterKey });
      }
    };

    const timer = setInterval(tick, LIVE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      isCancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [filterKey, isLive, queryClient]);

  return arrived.key === filterKey ? arrived.ids : NO_ARRIVALS;
};
