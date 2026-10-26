import type { EventFilters } from "@app/features/events/filters";
import { orpc } from "@app/lib/rpc";
import type { EventPage, ProductEvent } from "@shared/rpc/schemas";
import type { InfiniteData } from "@tanstack/react-query";

export const PAGE_SIZE = 50;
/** One `since` poll returns at most this many; a full page means we may have missed some. */
export const LIVE_PAGE_SIZE = 100;
export const LIVE_INTERVAL_MS = 5000;

export type EventPages = InfiniteData<EventPage, string | undefined>;

export const eventQueryInput = (filters: EventFilters) => ({
  ...(filters.channelId ? { channelId: filters.channelId } : {}),
  ...(filters.projectId ? { projectId: filters.projectId } : {}),
  ...(filters.search ? { search: filters.search } : {}),
});

/**
 * The feed, newest first, paged by keyset (`before`).
 *
 * Note: Never refetched in the background: a refetch re-runs every loaded
 * page with its old cursor, which can open gaps once live events have been
 * prepended. Live updates arrive through `since` polling instead, and
 * deletes edit the cache directly.
 */
export const eventsInfiniteOptions = (filters: EventFilters) =>
  orpc.events.list.infiniteOptions({
    getNextPageParam: (lastPage: EventPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    input: (before: string | undefined) => ({
      ...eventQueryInput(filters),
      ...(before ? { before } : {}),
      limit: PAGE_SIZE,
    }),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

const byNewest = (left: ProductEvent, right: ProductEvent) =>
  right.createdAt.localeCompare(left.createdAt);

/** Puts freshly polled events on top of the first page, skipping any already shown. */
export const prependEvents = (
  data: EventPages | undefined,
  incoming: readonly ProductEvent[]
): EventPages | undefined => {
  const [first, ...rest] = data?.pages ?? [];
  if (!(data && first)) {
    return data;
  }
  const known = new Set(
    data.pages.flatMap((page) => page.events.map((event) => event.id))
  );
  const fresh = incoming
    .filter((event) => !known.has(event.id))
    .toSorted(byNewest);
  if (fresh.length === 0) {
    return data;
  }
  return {
    ...data,
    pages: [{ ...first, events: [...fresh, ...first.events] }, ...rest],
  };
};

export const removeEvent = (
  data: EventPages | undefined,
  id: string
): EventPages | undefined =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      events: page.events.filter((event) => event.id !== id),
    })),
  };

/** Every loaded event once, in order (pages can overlap after live prepends). */
export const flattenEvents = (data: EventPages | undefined): ProductEvent[] => {
  const seen = new Set<string>();
  const events: ProductEvent[] = [];
  for (const page of data?.pages ?? []) {
    for (const event of page.events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }
  return events;
};
