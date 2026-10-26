import {
  Action,
  AnswerStatus,
  AnswerValue,
  AnswerValuesInput,
  Field,
} from "@shared/actions";
import { SEGMENTS } from "@shared/recipes";
import { KeyAccess } from "@shared/scopes";
import { Schema } from "effect";

/**
 * Dashboard RPC data shapes. Every schema here has identical encoded and
 * decoded forms (plain JSON), so the contract stays browser-safe and oRPC's
 * output validation never transforms values.
 */

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128));
const Name = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255)
);
const NullableString = Schema.NullOr(Schema.String);

export const Project = Schema.Struct({
  createdAt: Schema.String,
  deletedAt: NullableString,
  description: NullableString,
  firstEventAt: NullableString,
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  url: NullableString,
});
export type Project = typeof Project.Type;

export const Channel = Schema.Struct({
  createdAt: Schema.String,
  description: NullableString,
  icon: NullableString,
  id: Schema.String,
  name: Schema.String,
  projectId: Schema.String,
});
export type Channel = typeof Channel.Type;

export const DisplayAs = Schema.Literals(["message", "notification"]);

export const ProductEvent = Schema.Struct({
  channelId: Schema.String,
  channelName: Schema.String,
  createdAt: Schema.String,
  description: NullableString,
  displayAs: DisplayAs,
  icon: NullableString,
  id: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.Json),
  notify: Schema.Boolean,
  projectId: Schema.String,
  source: Schema.String,
  tags: Schema.Array(Schema.String),
  title: Schema.String,
  userId: NullableString,
  /** The event's links (`actions` with a url). */
  links: Schema.Array(
    Schema.Struct({ label: Schema.String, url: Schema.String })
  ),
  /** Set when the event asks something: where its answer stands. */
  question: Schema.NullOr(
    Schema.Struct({ answeredBy: NullableString, status: AnswerStatus })
  ),
});
export type ProductEvent = typeof ProductEvent.Type;

export const EventQuery = Schema.Struct({
  before: Schema.optional(Schema.String),
  channelId: Schema.optional(Id),
  limit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ maximum: 100, minimum: 1 }))
  ),
  projectId: Schema.optional(Id),
  search: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  since: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String.check(Schema.isMaxLength(255))),
});
export type EventQuery = typeof EventQuery.Type;

export const EventPage = Schema.Struct({
  events: Schema.Array(ProductEvent),
  nextCursor: NullableString,
});
export type EventPage = typeof EventPage.Type;

export const PulseRange = Schema.Literals(["24h", "7d", "30d"]);
export type PulseRange = typeof PulseRange.Type;

export const PulseQuery = Schema.Struct({
  channelId: Schema.optional(Id),
  projectId: Schema.optional(Id),
  range: PulseRange,
});
export type PulseQuery = typeof PulseQuery.Type;

const PeriodTotals = Schema.Struct({
  current: Schema.Number,
  previous: Schema.Number,
});

/**
 * Activity over a range, compared with the range before it: events per
 * bucket and in total, and (when events carry money) the summed value in
 * the most-used currency. See `src/shared/event-value.ts`.
 */
export const Pulse = Schema.Struct({
  bucketMs: Schema.Number,
  events: PeriodTotals,
  points: Schema.Array(
    Schema.Struct({
      at: Schema.String,
      events: Schema.Number,
      value: Schema.Number,
    })
  ),
  range: PulseRange,
  value: Schema.NullOr(
    Schema.Struct({
      current: Schema.Number,
      currency: Schema.String,
      previous: Schema.Number,
    })
  ),
});
export type Pulse = typeof Pulse.Type;

export const ApiKey = Schema.Struct({
  /** `full`, or `read`: reads events and channels, sends nothing. */
  access: KeyAccess,
  createdAt: Schema.String,
  enabled: Schema.Boolean,
  id: Schema.String,
  lastRequestAt: NullableString,
  name: Schema.String,
  projectId: NullableString,
  projectName: NullableString,
  /** Whether owners and admins can reveal the full key again. */
  revealable: Schema.Boolean,
  start: NullableString,
});
export type ApiKey = typeof ApiKey.Type;

export const RevealedApiKey = Schema.Struct({ secret: Schema.String });

export const CreatedApiKey = Schema.Struct({
  apiKey: ApiKey,
  secret: Schema.String,
});
export type CreatedApiKey = typeof CreatedApiKey.Type;

export const Workspace = Schema.Struct({
  organizationId: Schema.String,
  organizationName: Schema.String,
  organizationSlug: Schema.String,
  role: Schema.String,
});
export type Workspace = typeof Workspace.Type;

export const OrganizationBrand = Schema.Struct({
  /**
   * `found`: a brand was read. `none`: nothing to read yet (a mailbox
   * address, an unknown site). `off`: lookups aren't configured.
   */
  status: Schema.Literals(["found", "none", "off"]),
  domain: NullableString,
  name: NullableString,
  iconUrl: NullableString,
  /** Context.dev's subindustry label, e.g. "Software (B2B)". */
  industry: NullableString,
  segment: Schema.NullOr(Schema.Literals(SEGMENTS)),
  /** The caller may look up another website (owner or admin, lookups left). */
  canLookup: Schema.Boolean,
});
export type OrganizationBrand = typeof OrganizationBrand.Type;

export const BrandLookupInput = Schema.Struct({
  website: Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(255)),
});

export const GettingStartedStage = Schema.Literals([
  "setup",
  "send_event",
  "complete",
]);
export type GettingStartedStage = typeof GettingStartedStage.Type;

export const GettingStarted = Schema.Struct({
  /** The key the setup guide shows: the newest revealable one, if any. */
  apiKey: Schema.NullOr(ApiKey),
  /** This user's devices with push on in the organization. */
  devices: Schema.Number,
  firstEventAt: NullableString,
  organizationId: NullableString,
  project: Schema.NullOr(Project),
  stage: GettingStartedStage,
});
export type GettingStarted = typeof GettingStarted.Type;

/** The workspace a signed-in user lands in (created for them when they have none). */
export const WorkspaceRef = Schema.Struct({
  organizationId: Schema.String,
  organizationSlug: Schema.String,
});
export type WorkspaceRef = typeof WorkspaceRef.Type;

export const TestEventResult = Schema.Struct({
  channelId: Schema.String,
  eventId: Schema.String,
});

export const BootstrapInput = Schema.Struct({
  organizationName: Name,
  projectName: Name,
  websiteUrl: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
});

export const BootstrapResult = Schema.Struct({
  apiKey: CreatedApiKey,
  organizationId: Schema.String,
  organizationSlug: Schema.String,
  project: Project,
});
export type BootstrapResult = typeof BootstrapResult.Type;

export const ProjectInput = Schema.Struct({
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
  name: Name,
  url: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
});

export const ProjectUpdate = Schema.Struct({
  description: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(2000)))
  ),
  id: Id,
  name: Schema.optional(Name),
  url: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)))
  ),
});

export const ChannelInput = Schema.Struct({
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
  icon: Schema.optional(Schema.String.check(Schema.isMaxLength(16))),
  name: Name,
  projectId: Id,
});

/**
 * A channel's icon and description. Its name is the slug senders pass as
 * `channelName`, so it isn't editable: renaming would reroute their events.
 */
export const ChannelUpdate = Schema.Struct({
  description: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(2000)))
  ),
  icon: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(16)))
  ),
  id: Id,
});

export const ApiKeyInput = Schema.Struct({
  /** Default `full`. */
  access: Schema.optional(KeyAccess),
  name: Name,
  projectId: Id,
});

export const PushSubscriptionInput = Schema.Struct({
  auth: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  channelIds: Schema.Array(Id),
  endpoint: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(2048)
  ),
  p256dh: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export const PushSettings = Schema.Struct({
  channelIds: Schema.Array(Schema.String),
  subscribed: Schema.Boolean,
});
export type PushSettings = typeof PushSettings.Type;

const Endpoint = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2048)
);
const PushKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512)
);

/** This device's push subscription, as the browser hands it out. */
export const PushDeviceInput = Schema.Struct({
  auth: PushKey,
  endpoint: Endpoint,
  p256dh: PushKey,
});

/**
 * This device's current subscription, checked when the app opens. A browser
 * may replace its subscription; `previousEndpoint` is the one this device
 * last registered, so its rows can follow.
 */
export const PushDeviceSyncInput = Schema.Struct({
  auth: PushKey,
  endpoint: Endpoint,
  p256dh: PushKey,
  previousEndpoint: Schema.optional(Endpoint),
});

export const PushDeviceSync = Schema.Struct({
  /** Organizations this device has push on for. */
  organizations: Schema.Number,
});

/** Push on or off for one organization on this device; empty `channelIds` = all. */
export const PushOrganizationInput = Schema.Struct({
  auth: PushKey,
  channelIds: Schema.Array(Id),
  enabled: Schema.Boolean,
  endpoint: Endpoint,
  organizationId: Id,
  p256dh: PushKey,
});

export const PushPreferences = Schema.Struct({
  organizations: Schema.Array(
    Schema.Struct({
      /** Empty while subscribed means every channel, including later ones. */
      channelIds: Schema.Array(Schema.String),
      organizationId: Schema.String,
      organizationName: Schema.String,
      organizationSlug: Schema.String,
      projects: Schema.Array(
        Schema.Struct({
          channels: Schema.Array(
            Schema.Struct({
              icon: NullableString,
              id: Schema.String,
              name: Schema.String,
            })
          ),
          id: Schema.String,
          name: Schema.String,
        })
      ),
      subscribed: Schema.Boolean,
    })
  ),
});
export type PushPreferences = typeof PushPreferences.Type;

export const ById = Schema.Struct({ id: Id });
export const ByEndpoint = Schema.Struct({
  endpoint: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(2048)
  ),
});
export const ByProject = Schema.Struct({ projectId: Schema.optional(Id) });
export const EmojiInput = Schema.Struct({ name: Name });
export const EmojiResult = Schema.Struct({ emoji: Schema.String });
export const TestPushResult = Schema.Struct({ delivered: Schema.Number });

/**
 * Where an organization stands with hosted billing:
 * - `off`: billing isn't configured (self-hosted); nothing is gated.
 * - `trialing` / `active` / `past_due`: on a plan (Autumn's view).
 * - `comped`: free access granted by hand (beta organizations).
 * - `required`: no plan yet (a new organization starts here); a plan is needed.
 * - `ended`: a plan ran out or was cancelled.
 * `required` and `ended` pause pushes and lock the dashboard behind a paywall.
 */
export const BillingState = Schema.Literals([
  "off",
  "trialing",
  "active",
  "past_due",
  "comped",
  "required",
  "ended",
]);
export type BillingState = typeof BillingState.Type;

export const PlanIdSchema = Schema.Literals([
  "solo",
  "solo_annual",
  "team",
  "team_annual",
  "solo_lifetime",
  "team_lifetime",
]);

export const BillingStatus = Schema.Struct({
  canManage: Schema.Boolean,
  cancelsAt: NullableString,
  compUntil: NullableString,
  planId: Schema.NullOr(PlanIdSchema),
  renewsAt: NullableString,
  /** Seats the organization may fill; null when unlimited (comped, billing off). */
  seats: Schema.NullOr(Schema.Number),
  seatsUsed: Schema.Number,
  state: BillingState,
  trialEndsAt: NullableString,
});
export type BillingStatus = typeof BillingStatus.Type;

export const BillingStatusQuery = Schema.Struct({
  /** Ask Autumn now instead of trusting the cache (after returning from checkout). */
  refresh: Schema.optional(Schema.Boolean),
});

export const CheckoutInput = Schema.Struct({
  planId: PlanIdSchema,
  /**
   * Where Stripe's checkout returns to: the setup guide (a new organization
   * starting its trial from the paywall) or Settings → Billing (default).
   */
  returnTo: Schema.optional(Schema.Literals(["billing", "setup"])),
});

/** `url` is Stripe's checkout page; null when the plan started without one. */
export const CheckoutResult = Schema.Struct({ url: NullableString });

export const PortalResult = Schema.Struct({ url: Schema.String });

export const SeatsInput = Schema.Struct({
  seats: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 500 })
  ),
});

export const SeatsPreview = Schema.Struct({
  currency: Schema.String,
  /** Charged now (prorated). */
  dueNow: Schema.Number,
  /** The next regular invoice. */
  nextTotal: Schema.NullOr(Schema.Number),
  nextAt: NullableString,
});
export type SeatsPreview = typeof SeatsPreview.Type;

/** An event that waits for an answer, as its answer page shows it. */
export const AnswerCard = Schema.Struct({
  actions: Schema.Array(Action),
  answer: Schema.NullOr(
    Schema.Struct({
      action: Schema.NullOr(Schema.String),
      at: Schema.NullOr(Schema.String),
      by: Schema.NullOr(Schema.String),
      expiresAt: Schema.String,
      status: AnswerStatus,
      values: Schema.NullOr(Schema.Record(Schema.String, AnswerValue)),
    })
  ),
  channelName: Schema.String,
  createdAt: Schema.String,
  description: Schema.NullOr(Schema.String),
  eventId: Id,
  fields: Schema.Array(Field),
  icon: Schema.NullOr(Schema.String),
  title: Schema.String,
});
export type AnswerCard = typeof AnswerCard.Type;

export const ByEvent = Schema.Struct({ eventId: Id });

export const AnswerInput = Schema.Struct({
  action: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  eventId: Id,
  values: AnswerValuesInput,
});
export type AnswerInput = typeof AnswerInput.Type;
