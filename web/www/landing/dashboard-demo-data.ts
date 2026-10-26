import type { ProductEvent, Pulse, PulseRange } from "@shared/rpc/schemas";

/**
 * Made-up data for the homepage's dashboard demo: three fictional products
 * sending the moments EmitKit is for. No email addresses or domains, so the
 * feed never looks up brand icons for them.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const PROJECTS = [
  { color: "var(--orb-violet)", id: "project_lumen", name: "Lumen" },
  { color: "var(--orb-teal)", id: "project_harbor", name: "Harbor" },
  { color: "var(--orb-amber)", id: "project_relay", name: "Relay" },
] as const;

type ProjectId = (typeof PROJECTS)[number]["id"];

export const CHANNELS = {
  harborErrors: { icon: "🚨", id: "channel_harbor_errors", name: "errors" },
  harborMilestones: {
    icon: "🎉",
    id: "channel_harbor_milestones",
    name: "milestones",
  },
  harborPayments: {
    icon: "💳",
    id: "channel_harbor_payments",
    name: "payments",
  },
  harborSignups: { icon: "🌱", id: "channel_harbor_signups", name: "signups" },
  lumenMilestones: {
    icon: "🚀",
    id: "channel_lumen_milestones",
    name: "milestones",
  },
  lumenPayments: { icon: "💳", id: "channel_lumen_payments", name: "payments" },
  lumenSignups: { icon: "👋", id: "channel_lumen_signups", name: "signups" },
  relayAgents: { icon: "🤖", id: "channel_relay_agents", name: "agents" },
} as const;

type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

const PROJECT_OF: Record<Channel["id"], ProjectId> = {
  channel_harbor_errors: "project_harbor",
  channel_harbor_milestones: "project_harbor",
  channel_harbor_payments: "project_harbor",
  channel_harbor_signups: "project_harbor",
  channel_lumen_milestones: "project_lumen",
  channel_lumen_payments: "project_lumen",
  channel_lumen_signups: "project_lumen",
  channel_relay_agents: "project_relay",
};

/**
 * A question an event asks, with the answers it offers. This previews the
 * actions API EmitKit will add (`actions`, `reply`, `expiresIn`,
 * `onExpire`); the dashboard has no such field yet.
 */
export interface DemoAsk {
  readonly actions: readonly {
    readonly id: string;
    readonly label: string;
    readonly style: "primary" | "destructive";
  }[];
  /** How long after the event nobody answering counts as `onExpire`. */
  readonly expiresInMs: number;
  readonly onExpire: string;
  /** Whether the answer can carry a note back. */
  readonly reply: boolean;
}

/** An event as the demo writes it: when, relative to now, and what. */
export interface DemoMoment {
  readonly agoMs: number;
  readonly ask?: DemoAsk;
  readonly channel: Channel;
  readonly description?: string;
  readonly icon?: string;
  readonly metadata?: ProductEvent["metadata"];
  readonly notify?: boolean;
  readonly source?: string;
  readonly tags?: readonly string[];
  readonly title: string;
  readonly userId?: string;
}

const MOMENTS: readonly DemoMoment[] = [
  {
    agoMs: 0.4 * MINUTE_MS,
    channel: CHANNELS.lumenSignups,
    description: "from Product Hunt",
    notify: true,
    title: "New signup",
    userId: "Maya Chen",
  },
  {
    agoMs: 3 * MINUTE_MS,
    channel: CHANNELS.lumenPayments,
    description: "Pro · monthly",
    metadata: { amount: 29, currency: "USD", plan: "Pro" },
    notify: true,
    tags: ["first-payment"],
    title: "First payment",
    userId: "Maya Chen",
  },
  {
    agoMs: 7 * MINUTE_MS,
    ask: {
      actions: [
        { id: "approve", label: "Approve refund", style: "primary" },
        { id: "deny", label: "Decline", style: "destructive" },
      ],
      expiresInMs: 30 * MINUTE_MS,
      onExpire: "deny",
      reply: true,
    },
    channel: CHANNELS.relayAgents,
    description: "support-agent · Harbor Labs asked for their money back",
    icon: "🙋",
    metadata: { agent: "support-agent", amount: "$240", ticket: "#4812" },
    notify: true,
    source: "mcp",
    tags: ["approval"],
    title: "Refund $240 to Harbor Labs?",
  },
  {
    agoMs: 12 * MINUTE_MS,
    channel: CHANNELS.harborMilestones,
    description: "Northwind just sent its 100th invoice",
    notify: true,
    title: "Milestone",
    userId: "Northwind",
  },
  {
    agoMs: 18 * MINUTE_MS,
    channel: CHANNELS.lumenPayments,
    description: "5 seats · yearly",
    metadata: { amount: 590, currency: "USD", plan: "Team", seats: 5 },
    notify: true,
    tags: ["billing"],
    title: "Upgraded to Team",
    userId: "Harbor Labs",
  },
  {
    agoMs: 26 * MINUTE_MS,
    channel: CHANNELS.relayAgents,
    description: "research-agent · weekly churn summary is ready",
    icon: "✅",
    metadata: { agent: "research-agent", durationMs: 184_000, sources: 12 },
    source: "mcp",
    title: "Agent finished",
  },
  {
    agoMs: 41 * MINUTE_MS,
    channel: CHANNELS.lumenSignups,
    description: "invited by Maya Chen",
    title: "New signup",
    userId: "Tom Okafor",
  },
  {
    agoMs: 55 * MINUTE_MS,
    channel: CHANNELS.harborErrors,
    description: "14 payments declined in 5 minutes",
    metadata: { declined: 14, provider: "card processor", window: "5 min" },
    notify: true,
    tags: ["urgent", "checkout"],
    title: "Checkout is failing",
  },
  {
    agoMs: 80 * MINUTE_MS,
    channel: CHANNELS.harborSignups,
    description: "Bluebird Bakery · 14-day trial",
    title: "Trial started",
    userId: "Bluebird Bakery",
  },
  {
    agoMs: 2 * HOUR_MS,
    channel: CHANNELS.lumenMilestones,
    description: "Maya Chen created “Spring launch”",
    title: "First project created",
    userId: "Maya Chen",
  },
  {
    agoMs: 3 * HOUR_MS,
    channel: CHANNELS.harborPayments,
    description: "Growth · yearly",
    metadata: { amount: 1200, currency: "USD", plan: "Growth" },
    notify: true,
    title: "Subscription renewed",
    userId: "Northwind",
  },
  {
    agoMs: 4 * HOUR_MS,
    channel: CHANNELS.lumenPayments,
    description: "Pro · monthly",
    metadata: { amount: 29, currency: "USD", plan: "Pro" },
    notify: true,
    tags: ["first-payment"],
    title: "First payment",
    userId: "Ana Ruiz",
  },
  {
    agoMs: 5 * HOUR_MS,
    channel: CHANNELS.relayAgents,
    description: "research-agent passed 3 sources to writer-agent",
    icon: "🤝",
    source: "mcp",
    title: "Agent handoff",
  },
  {
    agoMs: 6 * HOUR_MS,
    channel: CHANNELS.harborErrors,
    description: "Payout webhook failing · 3 retries left",
    metadata: { attempts: 5, endpoint: "/webhooks/payouts", status: 502 },
    notify: true,
    tags: ["payouts"],
    title: "Webhook failing",
  },
  {
    agoMs: 9 * HOUR_MS,
    channel: CHANNELS.relayAgents,
    description: "support-agent · a refund outside policy, handed to you",
    icon: "🙋",
    metadata: { agent: "support-agent", ticket: "#4790" },
    notify: true,
    source: "mcp",
    tags: ["escalation"],
    title: "Agent couldn’t help",
  },
  {
    agoMs: 14 * HOUR_MS,
    channel: CHANNELS.relayAgents,
    description: "triage-agent · 38 tickets sorted overnight",
    icon: "✅",
    metadata: { agent: "triage-agent", durationMs: 2_340_000, tickets: 38 },
    source: "mcp",
    title: "Agent finished",
  },
  {
    agoMs: 21 * HOUR_MS,
    channel: CHANNELS.lumenMilestones,
    description: "1,000 designs exported this week",
    icon: "🏆",
    notify: true,
    title: "Milestone",
  },
  {
    agoMs: 23 * HOUR_MS,
    channel: CHANNELS.lumenPayments,
    description: "3 seats · monthly",
    metadata: { amount: 87, currency: "USD", plan: "Team", seats: 3 },
    notify: true,
    title: "Upgraded to Team",
    userId: "Ana Ruiz",
  },
  {
    agoMs: 26 * HOUR_MS,
    channel: CHANNELS.harborErrors,
    description: "Invoice PDF export timed out",
    metadata: { durationMs: 30_000, invoices: 42 },
    title: "Export failed",
  },
  {
    agoMs: 28 * HOUR_MS,
    channel: CHANNELS.lumenPayments,
    description: "Pro · yearly",
    metadata: { amount: 290, currency: "USD", plan: "Pro" },
    notify: true,
    title: "First payment",
    userId: "Tom Okafor",
  },
  {
    agoMs: 30 * HOUR_MS,
    channel: CHANNELS.lumenSignups,
    description: "from the pricing page",
    title: "New signup",
    userId: "Ana Ruiz",
  },
];

/** Moments that arrive while the demo is on screen, one after another. */
export const ARRIVALS: readonly DemoMoment[] = [
  {
    agoMs: 0,
    channel: CHANNELS.lumenSignups,
    description: "from Hacker News",
    notify: true,
    title: "New signup",
    userId: "Jonas Berg",
  },
  {
    agoMs: 0,
    channel: CHANNELS.harborPayments,
    description: "Starter · monthly",
    metadata: { amount: 19, currency: "USD", plan: "Starter" },
    notify: true,
    title: "First payment",
    userId: "Bluebird Bakery",
  },
  {
    agoMs: 0,
    channel: CHANNELS.relayAgents,
    description: "support-agent · a customer asked for a human",
    icon: "🙋",
    notify: true,
    source: "mcp",
    title: "Agent needs you",
  },
  {
    agoMs: 0,
    channel: CHANNELS.lumenMilestones,
    description: "Spring launch reached 10 collaborators",
    icon: "🎉",
    title: "Milestone",
  },
];

let sequence = 0;
const asks = new Map<string, DemoAsk>();

/** The question an event asks, if it asks one. */
export const askOf = (eventId: string): DemoAsk | undefined =>
  asks.get(eventId);

/** A moment as the feed reads events, stamped relative to `now`. */
export const toEvent = (moment: DemoMoment, now: number): ProductEvent => {
  sequence += 1;
  const id = `event_demo_${sequence}`;
  if (moment.ask) {
    asks.set(id, moment.ask);
  }
  return {
    channelId: moment.channel.id,
    channelName: moment.channel.name,
    createdAt: new Date(now - moment.agoMs).toISOString(),
    description: moment.description ?? null,
    displayAs: "notification",
    icon: moment.icon ?? moment.channel.icon,
    id,
    metadata: moment.metadata ?? {},
    notify: moment.notify ?? false,
    projectId: PROJECT_OF[moment.channel.id],
    source: moment.source ?? "api",
    tags: [...(moment.tags ?? [])],
    title: moment.title,
    userId: moment.userId ?? null,
    // The demo draws its own questions (askOf).
    links: [],
    question: null,
  };
};

export type ViewId = "feed" | "revenue" | "agents" | "errors";

export interface DemoView {
  readonly channelId?: Channel["id"];
  /** Unfolded when the view opens, so its details show at once. */
  readonly openTitle?: string;
  readonly projectId?: ProjectId;
  readonly range: PulseRange;
  /** Scales the made-up totals, so each scope has its own size. */
  readonly scale: number;
  readonly withRevenue: boolean;
}

export const VIEWS: Record<ViewId, DemoView> = {
  agents: {
    channelId: CHANNELS.relayAgents.id,
    openTitle: "Refund $240 to Harbor Labs?",
    projectId: "project_relay",
    range: "24h",
    scale: 0.3,
    withRevenue: false,
  },
  errors: {
    channelId: CHANNELS.harborErrors.id,
    openTitle: "Checkout is failing",
    projectId: "project_harbor",
    range: "24h",
    scale: 0.08,
    withRevenue: false,
  },
  feed: { range: "24h", scale: 1, withRevenue: true },
  revenue: {
    channelId: CHANNELS.lumenPayments.id,
    openTitle: "Upgraded to Team",
    projectId: "project_lumen",
    range: "7d",
    scale: 0.22,
    withRevenue: true,
  },
};

/** The view's events, newest first, stamped relative to `now`. */
export const eventsFor = (view: DemoView, now: number): ProductEvent[] =>
  MOMENTS.filter(
    (moment) =>
      (!view.channelId || moment.channel.id === view.channelId) &&
      (!view.projectId || PROJECT_OF[moment.channel.id] === view.projectId)
  ).map((moment) => toEvent(moment, now));

const BUCKETS: Record<PulseRange, { count: number; ms: number }> = {
  "24h": { count: 24, ms: HOUR_MS },
  "30d": { count: 30, ms: 24 * HOUR_MS },
  "7d": { count: 28, ms: 6 * HOUR_MS },
};

/** Events per bucket before scaling, and how much each event is worth. */
const PER_BUCKET: Record<PulseRange, number> = { "24h": 5, "30d": 42, "7d": 9 };
const VALUE_PER_EVENT = 7.5;

/** A repeatable wobble in [0, 1), so the curves look lived-in but stay put. */
const wobble = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43_758.5453;
  return x - Math.floor(x);
};

/**
 * Made-up totals and curves for a view and range: gently growing, with a
 * daily rhythm, and each compared with a somewhat quieter period before.
 */
export const pulseFor = (
  view: DemoView,
  range: PulseRange,
  now: number,
  extraEvents = 0
): Pulse => {
  const { count, ms } = BUCKETS[range];
  const base = PER_BUCKET[range] * view.scale;
  const points = Array.from({ length: count }, (_, index) => {
    const growth = 0.75 + (0.5 * index) / count;
    const rhythm = 0.6 + 0.8 * wobble(index + count * 7 + view.scale * 100);
    const events = Math.max(0, Math.round(base * growth * rhythm * 1.2));
    const paid = view.withRevenue
      ? Math.round(events * VALUE_PER_EVENT * (0.4 + wobble(index * 3.1)))
      : 0;
    return {
      at: new Date(now - (count - index) * ms).toISOString(),
      events,
      value: paid,
    };
  });
  const last = points.at(-1);
  if (last && extraEvents > 0) {
    last.events += extraEvents;
  }
  const current = points.reduce((sum, point) => sum + point.events, 0);
  const value = points.reduce((sum, point) => sum + point.value, 0);
  return {
    bucketMs: ms,
    events: { current, previous: Math.round(current / 1.23) },
    points,
    range,
    value: view.withRevenue
      ? { currency: "USD", current: value, previous: Math.round(value / 1.31) }
      : null,
  };
};
