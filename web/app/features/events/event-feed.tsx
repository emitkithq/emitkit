import { EventDetails } from "@app/features/events/event-details";
import type {
  ChannelLink,
  EventActions,
} from "@app/features/events/event-details";
import { Money } from "@app/features/events/event-values";
import { RichText } from "@app/features/events/rich-text";
import { formatRelative } from "@app/lib/format";
import { Button, Skeleton } from "@heroui/react";
import { eventValue } from "@shared/event-value";
import type { ProductEvent } from "@shared/rpc/schemas";
import { Icon } from "@ui/icon";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DAY_MS = 86_400_000;

/** Room kept clear under the sticky header for the sticky day label. */
const DAY_LABEL_PX = 40;
/** Room kept clear at the bottom of the viewport. */
const BOTTOM_GAP_PX = 24;
/** Matches the Unfold transition's duration-300. */
const UNFOLD_MS = 300;

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  weekday: "long",
});

const dayLabel = (iso: string, now: number): string => {
  const day = new Date(iso).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  if (day === today) {
    return "Today";
  }
  if (day === today - DAY_MS) {
    return "Yesterday";
  }
  return dayFormatter.format(new Date(iso));
};

const byDay = (events: readonly ProductEvent[], now: number) => {
  const sections: { day: string; events: ProductEvent[] }[] = [];
  for (const event of events) {
    const day = dayLabel(event.createdAt, now);
    const last = sections.at(-1);
    if (last?.day === day) {
      last.events.push(event);
    } else {
      sections.push({ day, events: [event] });
    }
  }
  return sections;
};

/**
 * Animates its content's height open and closed (grid rows 0fr ↔ 1fr),
 * keeping the content mounted until the closing transition ends. `instant`
 * closes without animating: used when another event opens instead, so
 * nothing moves above the row that was just clicked.
 */
const Unfold = ({
  children,
  id,
  instant,
  open,
}: {
  children: ReactNode;
  id: string;
  instant: boolean;
  open: boolean;
}) => {
  const [isMounted, setIsMounted] = useState(open);
  if (open && !isMounted) {
    setIsMounted(true);
  }
  if (!open && instant && isMounted) {
    setIsMounted(false);
  }
  const transition =
    instant && !open
      ? ""
      : "transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";
  return (
    <div
      className={`grid ${transition} ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      id={id}
      inert={!open}
      onTransitionEnd={(transitionEvent) => {
        if (transitionEvent.target === transitionEvent.currentTarget && !open) {
          setIsMounted(false);
        }
      }}
    >
      <div className="min-h-0 overflow-hidden" data-unfold>
        {isMounted ? children : null}
      </div>
    </div>
  );
};

const EventRow = ({
  actions,
  channelLink,
  event,
  hasJustArrived,
  isOpen,
  isSwitching,
  now,
  onDelete,
  onToggle,
  projectName,
}: {
  actions: EventActions | undefined;
  channelLink: ChannelLink | undefined;
  event: ProductEvent;
  hasJustArrived: boolean;
  isOpen: boolean;
  isSwitching: boolean;
  now: number;
  onDelete: ((event: ProductEvent) => void) | undefined;
  onToggle: () => void;
  projectName: string | undefined;
}) => {
  const value = eventValue(event.metadata);
  const detailsId = `event-${event.id}-details`;
  // Closed, a row is one glance: long text ends in an ellipsis. Open, it
  // reads in full, breaking long URLs and addresses where it must.
  const clip = isOpen ? "wrap-anywhere" : "truncate";
  return (
    <article
      aria-label={event.title}
      className={`relative isolate -mx-2.5 rounded-2xl transition-[background-color,box-shadow] duration-300 ${
        isOpen ? "bg-surface shadow-overlay my-3" : ""
      }`}
      data-event-id={event.id}
      data-testid="event-row"
    >
      {hasJustArrived ? (
        <span
          aria-hidden="true"
          className="event-flash absolute inset-0 -z-10 rounded-2xl"
        />
      ) : null}
      <button
        aria-controls={detailsId}
        aria-expanded={isOpen}
        className={`focus-visible:ring-focus flex w-full items-start gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 ${
          isOpen ? "" : "hover:bg-default-soft"
        }`}
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className="bg-default-soft grid size-10 shrink-0 place-items-center rounded-xl text-[19px]"
        >
          {event.icon ?? (
            <Icon className="text-muted" name="activity" size={16} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <span
              className={`text-label text-foreground min-w-0 flex-1 font-medium ${clip}`}
            >
              {event.title}
            </span>
            {value ? (
              <Money
                className={`text-title shrink-0 font-semibold tabular-nums ${
                  value.amount < 0 ? "text-danger" : "text-success"
                }`}
                signed
                value={value}
              />
            ) : null}
          </span>
          {/* On a phone, and whenever the event is open, the description has
              a line of its own; otherwise it shares one with the channel. */}
          <span
            className={`text-body text-muted flex min-w-0 flex-wrap items-center gap-x-1.5 ${
              isOpen ? "" : "sm:flex-nowrap"
            }`}
          >
            {event.description ? (
              <>
                <span
                  className={`min-w-0 ${clip} ${
                    isOpen ? "basis-full" : "basis-full sm:basis-auto"
                  }`}
                >
                  <RichText links={false} value={event.description} />
                </span>
                <span
                  aria-hidden="true"
                  className={isOpen ? "hidden" : "hidden sm:inline"}
                >
                  ·
                </span>
              </>
            ) : null}
            <span
              className={`flex min-w-0 flex-1 items-center gap-1.5 ${
                isOpen ? "" : "sm:contents"
              }`}
            >
              {/* Sharing a line, capped so a long channel name can't squeeze
                  the description away; both truncate before the time does. */}
              <span
                className={`min-w-0 ${clip} ${
                  isOpen ? "" : "sm:max-w-[45%] sm:shrink-0"
                }`}
              >
                {projectName ? `${projectName} · ` : ""}#{event.channelName}
              </span>
              <span aria-hidden="true">·</span>
              <time
                className="shrink-0 tabular-nums"
                dateTime={event.createdAt}
              >
                {formatRelative(event.createdAt, now)}
              </time>
              {event.question?.status === "pending" ? (
                <span className="text-accent-soft-foreground shrink-0 font-medium">
                  Waiting<span className="max-sm:sr-only"> for an answer</span>
                </span>
              ) : null}
              {event.notify ? (
                <span className="shrink-0" title="Sent as a push notification">
                  <Icon name="bell" size={12} />
                  <span className="sr-only">Push notification sent</span>
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </button>
      <Unfold id={detailsId} instant={isSwitching} open={isOpen}>
        <div className="px-2.5 pt-1 pb-4 sm:pl-[64px]">
          <EventDetails
            actions={actions}
            channelLink={channelLink}
            event={event}
            now={now}
            onDelete={onDelete}
            projectName={projectName}
          />
        </div>
      </Unfold>
    </article>
  );
};

/** Rows shaped like the feed's, while the first page loads. */
export const FeedSkeleton = () => (
  <output aria-label="Loading events" className="block">
    <Skeleton className="mt-6 mb-3 h-3 w-14 rounded-md" />
    {Array.from({ length: 6 }, (_, index) => (
      <div className="flex items-start gap-3 py-2.5" key={index}>
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-2/5 rounded-md" />
          <Skeleton className="h-3 w-3/4 rounded-md" />
        </div>
      </div>
    ))}
  </output>
);

const rowOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`);

/**
 * The feed, grouped by day. Clicking an event unfolds its details right
 * under it; one event is open at a time (`initialOpenId` opens one first).
 *
 * `embedded` is for a feed inside its own scrolling box, such as the
 * marketing site's demo: day labels stick to the box's top and the page is
 * never scrolled. Otherwise, scrolling while unfolding, done before paint:
 * 1. The clicked row stays exactly where it was under the pointer, even
 *    when a card above it closes (that one closes instantly).
 * 2. If the unfolding card won't fit, the page starts scrolling at once, in
 *    step with the unfold, by just enough to show all of it, but never so
 *    far that the row slides under the sticky header.
 */
export const EventFeed = ({
  actions,
  arrivedIds,
  channelLink,
  embedded = false,
  events,
  hasMore,
  initialOpenId = null,
  isFetchingMore,
  now,
  onDelete,
  onLoadMore,
  projectNames,
}: {
  actions?: EventActions | undefined;
  arrivedIds: ReadonlySet<string>;
  channelLink?: ChannelLink | undefined;
  embedded?: boolean;
  events: readonly ProductEvent[];
  hasMore: boolean;
  initialOpenId?: string | null;
  isFetchingMore: boolean;
  now: number;
  onDelete?: ((event: ProductEvent) => void) | undefined;
  onLoadMore?: () => void;
  projectNames: ReadonlyMap<string, string> | undefined;
}) => {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [isSwitching, setIsSwitching] = useState(false);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    const row = rowOf(id);
    anchor.current = row ? { id, top: row.getBoundingClientRect().top } : null;
    setIsSwitching(openId !== null && next !== null);
    setOpenId(next);
  };

  useEffect(() => {
    if (openId === null) {
      return;
    }
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !keyboardEvent.defaultPrevented) {
        setIsSwitching(false);
        setOpenId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openId]);

  useLayoutEffect(() => {
    const clicked = anchor.current;
    anchor.current = null;
    const row = clicked ? rowOf(clicked.id) : null;
    if (!(clicked && row) || embedded) {
      return;
    }
    const drift = row.getBoundingClientRect().top - clicked.top;
    if (drift !== 0) {
      window.scrollBy({ behavior: "instant", top: drift });
    }
    if (openId !== clicked.id) {
      return;
    }
    const header = document.querySelector<HTMLElement>("[data-app-header]");
    const clearTop =
      (header?.getBoundingClientRect().bottom ?? 0) + DAY_LABEL_PX;
    const content = row.querySelector<HTMLElement>("[data-unfold]");
    const { top } = row.getBoundingClientRect();
    const bottom = top + row.offsetHeight + (content?.scrollHeight ?? 0);
    const overflow = bottom - (window.innerHeight - BOTTOM_GAP_PX);
    const room = top - clearTop;
    const by = overflow > 0 ? Math.min(overflow, room) : Math.min(0, room);
    if (by === 0) {
      return;
    }
    // The card is still 0px tall, so the page may not be long enough yet to
    // scroll that far. Hold the room open until the unfold has caught up.
    const feed = feedRef.current;
    const reserve = (content?.scrollHeight ?? 0) + DAY_LABEL_PX;
    if (feed) {
      feed.style.minHeight = `${feed.offsetHeight + reserve}px`;
    }
    window.scrollBy({ behavior: "smooth", top: by });
    const release = setTimeout(() => {
      if (feed) {
        feed.style.minHeight = "";
      }
    }, UNFOLD_MS + 100);
    return () => clearTimeout(release);
  }, [openId, anchor, embedded]);

  return (
    <div ref={feedRef}>
      <div aria-label="Events" role="feed">
        {byDay(events, now).map((section) => (
          <section aria-label={section.day} key={section.day}>
            <h3
              className={`bg-background text-meta text-muted sticky z-[5] pt-5 pb-1.5 font-medium ${
                embedded
                  ? "top-0"
                  : "top-[calc(3.5rem+env(safe-area-inset-top))]"
              }`}
            >
              {section.day}
            </h3>
            {section.events.map((event) => (
              <EventRow
                actions={actions}
                channelLink={channelLink}
                event={event}
                hasJustArrived={arrivedIds.has(event.id)}
                isOpen={openId === event.id}
                isSwitching={isSwitching}
                key={event.id}
                now={now}
                onDelete={onDelete}
                onToggle={() => toggle(event.id)}
                projectName={projectNames?.get(event.projectId)}
              />
            ))}
          </section>
        ))}
      </div>
      {hasMore && onLoadMore ? (
        <div className="flex justify-center py-6">
          <Button
            isPending={isFetchingMore}
            onPress={onLoadMore}
            size="sm"
            variant="secondary"
          >
            {isFetchingMore ? "Loading…" : "Load older events"}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
