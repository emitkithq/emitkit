import { EventFeed } from "@app/features/events/event-feed";
import { PulseView } from "@app/features/events/pulse-view";
import { formatRelative } from "@app/lib/format";
import { Button } from "@heroui/react";
import type { ProductEvent, PulseRange } from "@shared/rpc/schemas";
import { Icon } from "@ui/icon";
import { MemberAvatar } from "@ui/member-avatar";
import {
  ARRIVALS,
  askOf,
  CHANNELS,
  eventsFor,
  PROJECTS,
  pulseFor,
  toEvent,
  VIEWS,
} from "@www/landing/dashboard-demo-data";
import type { ViewId } from "@www/landing/dashboard-demo-data";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * The real dashboard feed and pulse (`@app/features/events`), running on
 * made-up data inside the homepage hero. Loaded as its own chunk after
 * hydration (see `hero.tsx`), so the dashboard components and recharts never
 * weigh on the first paint.
 */

/** How often a new moment arrives in the "Live feed" view. */
const ARRIVAL_MS = 5200;
/** How often relative timestamps ("3m ago") are recomputed. */
const CLOCK_TICK_MS = 15_000;

const PROJECT_NAMES = new Map<string, string>(
  PROJECTS.map((project) => [project.id, project.name])
);

const channelById = (id: string | undefined) =>
  Object.values(CHANNELS).find((channel) => channel.id === id);

/**
 * New moments land at the top every few seconds, only while the demo is on
 * screen and the tab is visible, and never for readers who ask for less
 * motion.
 */
const useArrivals = (
  enabled: boolean,
  onArrive: (event: ProductEvent) => void
) => {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (
      !(enabled && element) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let next = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry?.isIntersecting) {
        timer = setInterval(() => {
          if (document.hidden) {
            return;
          }
          const moment = ARRIVALS[next % ARRIVALS.length];
          next += 1;
          if (moment) {
            onArrive(toEvent(moment, Date.now()));
          }
        }, ARRIVAL_MS);
      }
    });
    observer.observe(element);
    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
  }, [enabled, onArrive]);

  return root;
};

const useClock = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(ticker);
  }, []);
  return now;
};

interface Answer {
  readonly at: number;
  readonly choice: string;
  readonly note: string;
}

const AnswersContext = createContext<{
  answer: (eventId: string, answer: Answer) => void;
  answers: ReadonlyMap<string, Answer>;
  now: number;
} | null>(null);

const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/**
 * Answering an event that asks a question: the buttons it offers, an
 * optional note back, and what happens if nobody answers. A preview of the
 * actions API; the answer only lives in this demo.
 */
const DemoActions = ({ event }: { event: ProductEvent }) => {
  const ask = askOf(event.id);
  const answers = useContext(AnswersContext);
  const [note, setNote] = useState("");
  if (!(ask && answers)) {
    return null;
  }
  const { now } = answers;
  const given = answers.answers.get(event.id);
  if (given) {
    const action = ask.actions.find(
      (candidate) => candidate.id === given.choice
    );
    const approved = action?.style === "primary";
    return (
      <output
        className={`text-body flex items-start gap-2.5 rounded-2xl px-3.5 py-3 ${
          approved ? "bg-success-soft" : "bg-danger-soft"
        }`}
      >
        <Icon
          className={`mt-0.5 shrink-0 ${approved ? "text-success" : "text-danger"}`}
          name={approved ? "check" : "close"}
          size={14}
        />
        <span className="min-w-0">
          <span className="text-foreground font-medium">
            You chose “{action?.label ?? given.choice}”
          </span>
          <span className="text-muted">
            {" "}
            · {formatRelative(new Date(given.at).toISOString(), now)}
          </span>
          <span className="text-muted block">
            {given.note
              ? `Sent to ${event.description?.split(" · ")[0] ?? "the agent"} with your note: “${given.note}”`
              : `Sent to ${event.description?.split(" · ")[0] ?? "the agent"}, which carries on.`}
          </span>
        </span>
      </output>
    );
  }
  const left = Date.parse(event.createdAt) + ask.expiresInMs - now;
  const fallback = ask.actions.find(
    (candidate) => candidate.id === ask.onExpire
  );
  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-3.5">
      <p className="text-meta text-muted m-0 flex items-center gap-2">
        <span className="bg-warning size-1.5 rounded-full" />
        <span>
          Waiting for your answer
          {fallback
            ? ` · ${fallback.label.toLowerCase()} in ${minutesLeft(left)}m if nobody answers`
            : null}
        </span>
      </p>
      {ask.reply ? (
        <input
          aria-label="Add a note for the agent"
          className="border-field-border bg-field text-body placeholder:text-field-placeholder h-9 rounded-xl border px-3 outline-none"
          onChange={(changeEvent) => setNote(changeEvent.target.value)}
          placeholder="Add a note for the agent (optional)"
          value={note}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {ask.actions.map((action) => (
          <Button
            key={action.id}
            onPress={() =>
              answers.answer(event.id, {
                at: Date.now(),
                choice: action.id,
                note: note.trim(),
              })
            }
            size="sm"
            variant={action.style === "primary" ? "primary" : "danger-soft"}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

/** The dashboard's top bar, as the signed-in app draws it. */
const DemoHeader = ({ projectId }: { projectId: string | undefined }) => {
  const project = PROJECTS.find((candidate) => candidate.id === projectId);
  return (
    <div className="bg-background flex h-14 shrink-0 items-center gap-1 px-4">
      <span className="flex min-w-0 items-center gap-2 py-1 pr-1.5 pl-0.5">
        <MemberAvatar
          className="rounded-lg"
          hue="violet"
          image="/web-app-manifest-192x192.png"
          initials="E"
          size="md"
        />
        <span className="text-foreground text-title hidden truncate font-semibold sm:inline">
          EmitKit
        </span>
      </span>
      <span aria-hidden="true" className="text-border">
        /
      </span>
      <span className="text-title text-foreground flex min-w-0 items-center gap-2 px-2 font-medium whitespace-nowrap">
        {project ? (
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: project.color }}
          />
        ) : null}
        {project?.name ?? "All projects"}
        <Icon className="text-muted" name="chevron-down" size={14} />
      </span>
      <span className="flex-1" />
      <span className="text-meta text-muted mr-3 hidden items-center gap-2 sm:flex">
        <span className="live-dot" />
        Live
      </span>
      <Icon className="text-muted mr-3" name="search" size={15} />
      <MemberAvatar hue="amber" initials="MC" size="sm" />
    </div>
  );
};

/**
 * One view of the demo dashboard: its pulse, search, channel filter and
 * feed. Clicking an event unfolds it; the channel chip clears the filter.
 */
export const DashboardDemo = ({ view: viewId }: { view: ViewId }) => {
  const view = VIEWS[viewId];
  const now = useClock();
  const [range, setRange] = useState<PulseRange>(view.range);
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState<string | undefined>(
    view.channelId
  );
  const [events, setEvents] = useState(() => eventsFor(view, Date.now()));
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  // The feed reads this once, when it mounts.
  const initialOpenId =
    events.find((event) => event.title === view.openTitle)?.id ?? null;

  const onArrive = useCallback((event: ProductEvent) => {
    setEvents((current) => [event, ...current]);
    setArrivedIds((current) => new Set([...current, event.id]));
  }, []);
  const root = useArrivals(viewId === "feed", onArrive);

  const [answers, setAnswers] = useState<ReadonlyMap<string, Answer>>(
    () => new Map()
  );
  const answersValue = useMemo(
    () => ({
      answer: (eventId: string, given: Answer) =>
        setAnswers((current) => new Map([...current, [eventId, given]])),
      answers,
      now,
    }),
    [answers, now]
  );

  const pulse = useMemo(
    () => pulseFor(view, range, now, range === "24h" ? arrivedIds.size : 0),
    [view, range, now, arrivedIds.size]
  );

  const query = search.trim().toLowerCase();
  const visible = events.filter(
    (event) =>
      (!channelId || event.channelId === channelId) &&
      (!query ||
        event.title.toLowerCase().includes(query) ||
        (event.description ?? "").toLowerCase().includes(query))
  );
  const channel = channelById(channelId);

  return (
    <div
      className="bg-background text-foreground flex h-full flex-col"
      ref={root}
    >
      <DemoHeader projectId={view.projectId} />
      {/* On a phone a swipe over the demo scrolls the page, not the feed. */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-10 sm:overflow-y-auto sm:px-6">
        <PulseView data={pulse} onRangeChange={setRange} range={range} />
        <div className="mt-5 flex items-center gap-2">
          <label className="border-field-border bg-field focus-within:border-field-border-hover flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3">
            <Icon className="text-muted shrink-0" name="search" size={14} />
            <input
              aria-label="Search events"
              className="text-body placeholder:text-field-placeholder min-w-0 flex-1 bg-transparent outline-none"
              onChange={(changeEvent) => setSearch(changeEvent.target.value)}
              placeholder="Search events"
              type="search"
              value={search}
            />
          </label>
          {channel ? (
            <button
              aria-label={`Show all channels (now #${channel.name})`}
              className="bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft-hover text-body flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 font-medium"
              onClick={() => setChannelId(undefined)}
              type="button"
            >
              <span aria-hidden="true">{channel.icon}</span>#{channel.name}
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
        {visible.length > 0 ? (
          <AnswersContext value={answersValue}>
            <EventFeed
              actions={DemoActions}
              arrivedIds={arrivedIds}
              embedded
              events={visible}
              hasMore={false}
              initialOpenId={initialOpenId}
              isFetchingMore={false}
              now={now}
              projectNames={view.projectId ? undefined : PROJECT_NAMES}
            />
          </AnswersContext>
        ) : (
          <p className="text-body text-muted py-10 text-center">
            No event matches “{search}”.
          </p>
        )}
      </div>
    </div>
  );
};
