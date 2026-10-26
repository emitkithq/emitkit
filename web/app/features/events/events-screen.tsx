import { ConfirmDialog } from "@app/components/confirm-dialog";
import { EventQuestion } from "@app/features/answers/event-question";
import { EmptyFeed } from "@app/features/events/empty-feed";
import type { ChannelLink } from "@app/features/events/event-details";
import { EventFeed, FeedSkeleton } from "@app/features/events/event-feed";
import type { EventFilters } from "@app/features/events/filters";
import { PulseCard } from "@app/features/events/pulse-card";
import type { EventPages } from "@app/features/events/queries";
import {
  eventsInfiniteOptions,
  flattenEvents,
  removeEvent,
} from "@app/features/events/queries";
import { useLiveEvents } from "@app/features/events/use-live-events";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, toast } from "@heroui/react";
import type { ProductEvent } from "@shared/rpc/schemas";
import { useDebouncedCallback } from "@tanstack/react-pacer/debouncer";
import { useThrottledCallback } from "@tanstack/react-pacer/throttler";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";
import { useEffect, useMemo, useState } from "react";

/** How often relative timestamps ("3m ago") are recomputed. */
const CLOCK_TICK_MS = 15_000;
const SEARCH_DEBOUNCE_MS = 300;
/**
 * New events refresh the pulse at once, then at most this often: longer
 * ranges (and the previous 24 hours) are read from Analytics Engine.
 */
const PULSE_REFRESH_MS = 30_000;

const useTickingClock = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(ticker);
  }, []);
  return now;
};

const SearchInput = ({
  onChange,
  value,
}: {
  onChange: (value: string | undefined) => void;
  value: string | undefined;
}) => {
  const [text, setText] = useState(value ?? "");
  const commit = useDebouncedCallback(
    (next: string) => onChange(next.trim() ? next : undefined),
    { wait: SEARCH_DEBOUNCE_MS }
  );
  // Follow the URL when it changes underneath the input (back button, links).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value ?? "");
  }
  return (
    <label className="border-field-border bg-field focus-within:border-field-border-hover flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3">
      <Icon className="text-muted shrink-0" name="search" size={14} />
      <input
        aria-label="Search events"
        className="text-body placeholder:text-field-placeholder min-w-0 flex-1 bg-transparent outline-none"
        onChange={(changeEvent) => {
          setText(changeEvent.target.value);
          commit(changeEvent.target.value);
        }}
        placeholder="Search events"
        type="search"
        value={text}
      />
    </label>
  );
};

/** An event's channel label as a link to that channel's feed. */
const ChannelFeedLink: ChannelLink = ({ children, event }) => {
  const { org } = useParams({ from: "/$org" });
  return (
    <Link
      className="text-foreground no-underline hover:underline"
      params={{ org }}
      search={{ channelId: event.channelId, projectId: event.projectId }}
      to="/$org"
    >
      {children}
    </Link>
  );
};

/**
 * The organization's events: its pulse, then one live feed. Project,
 * channel and search live in the URL, so a filtered feed can be linked.
 */
export const EventsScreen = ({
  filters,
  onFiltersChange,
}: {
  filters: EventFilters;
  onFiltersChange: (
    changed: Partial<Record<keyof EventFilters, string | undefined>>
  ) => void;
}) => {
  const [pendingDelete, setPendingDelete] = useState<ProductEvent>();
  const now = useTickingClock();
  const queryClient = useQueryClient();

  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} }));
  const eventsOptions = eventsInfiniteOptions(filters);
  const events = useInfiniteQuery(eventsOptions);
  const arrivedIds = useLiveEvents({ filters, isLive: true });

  // New events change the pulse; re-read it rather than wait for its timer.
  const refreshPulse = useThrottledCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.events.pulse.key() }),
    { leading: true, trailing: true, wait: PULSE_REFRESH_MS }
  );
  useEffect(() => {
    if (arrivedIds.size > 0) {
      refreshPulse();
    }
  }, [arrivedIds, refreshPulse]);

  const visibleEvents = useMemo(
    () => flattenEvents(events.data),
    [events.data]
  );
  const activeChannel = channels.data?.find(
    (channel) => channel.id === filters.channelId
  );
  const liveProjects = (projects.data ?? []).filter(
    (project) => !project.deletedAt
  );
  const projectNames = useMemo(
    () =>
      filters.projectId || liveProjects.length < 2
        ? undefined
        : new Map(liveProjects.map((project) => [project.id, project.name])),
    [filters.projectId, liveProjects]
  );

  const deleteEvent = useMutation({
    mutationFn: (event: ProductEvent) => rpc.events.remove({ id: event.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The event couldn't be deleted.")),
    onSuccess: async (_result, event) => {
      queryClient.setQueryData<EventPages>(eventsOptions.queryKey, (data) =>
        removeEvent(data, event.id)
      );
      setPendingDelete(undefined);
      toast.success(`Deleted “${event.title}”`);
      await queryClient.invalidateQueries({
        queryKey: orpc.events.pulse.key(),
      });
    },
  });

  const renderFeed = () => {
    if (events.isError) {
      return (
        <EmptyState
          action={
            <Button
              onPress={() => events.refetch()}
              size="sm"
              variant="secondary"
            >
              Try again
            </Button>
          }
          description={errorMessage(
            events.error,
            "Events couldn't be loaded. Retry in a moment."
          )}
          icon="close"
          title="Events unavailable"
          variant="dashed"
        />
      );
    }
    // A filter change starts a new query with no pages: without this the
    // feed would claim "nothing here" before it has asked.
    if (events.isPending) {
      return <FeedSkeleton />;
    }
    if (visibleEvents.length === 0) {
      return filters.search ? (
        <EmptyState
          action={
            <Button
              onPress={() => onFiltersChange({ search: undefined })}
              size="sm"
              variant="secondary"
            >
              Clear search
            </Button>
          }
          description={`No event matches “${filters.search}”.`}
          icon="search"
          title="Nothing matches"
          variant="block"
        />
      ) : (
        <EmptyFeed channelName={activeChannel?.name} />
      );
    }
    return (
      <EventFeed
        actions={EventQuestion}
        arrivedIds={arrivedIds}
        channelLink={ChannelFeedLink}
        events={visibleEvents}
        hasMore={events.hasNextPage}
        isFetchingMore={events.isFetchingNextPage}
        now={now}
        onDelete={setPendingDelete}
        onLoadMore={() => events.fetchNextPage()}
        projectNames={projectNames}
      />
    );
  };

  return (
    <div className="max-w-page mx-auto w-full px-4 pb-24">
      <h1 className="sr-only">Events</h1>

      <PulseCard channelId={filters.channelId} projectId={filters.projectId} />

      <div className="mt-5 flex items-center gap-2">
        <SearchInput
          onChange={(search) => onFiltersChange({ search })}
          value={filters.search}
        />
        {filters.channelId ? (
          <button
            aria-label={`Show all channels (now #${activeChannel?.name ?? "channel"})`}
            className="bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft-hover text-body flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 font-medium"
            onClick={() => onFiltersChange({ channelId: undefined })}
            type="button"
          >
            {activeChannel?.icon ? <span>{activeChannel.icon}</span> : null}#
            {activeChannel?.name ?? "channel"}
            <Icon name="close" size={12} />
          </button>
        ) : null}
      </div>

      <section aria-label="Feed" className="mt-1">
        {renderFeed()}
      </section>

      <ConfirmDialog
        confirmLabel="Delete event"
        description={
          <>
            <span className="text-foreground font-medium">
              {pendingDelete?.title}
            </span>{" "}
            will be removed from the feed for everyone in this organization.
            This can’t be undone.
          </>
        }
        isOpen={pendingDelete !== undefined}
        isPending={deleteEvent.isPending}
        onConfirm={() => pendingDelete && deleteEvent.mutate(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(undefined);
          }
        }}
        title="Delete this event?"
      />
    </div>
  );
};
