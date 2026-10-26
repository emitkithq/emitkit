import { ApiKeys } from "@server/api-keys/api-keys";
import { Billing } from "@server/billing/billing";
import { BillingEvents } from "@server/billing/billing-events";
import { Callbacks } from "@server/cards/callbacks";
import { Cards } from "@server/cards/cards";
import { Channels } from "@server/channels/channels";
import { EmojiSuggester } from "@server/emoji/emoji";
import { EventStoreLive } from "@server/events/event-store";
import { Events } from "@server/events/events";
import { GettingStartedFlow } from "@server/getting-started/getting-started";
import { Idempotency } from "@server/idempotency/idempotency";
import { Identities } from "@server/identities/identities";
import { McpServer } from "@server/mcp/mcp";
import { Notifications } from "@server/notifications/notifications";
import { PushPreferencesFlow } from "@server/notifications/preferences";
import { OrganizationBrands } from "@server/organizations/brand";
import { Memberships } from "@server/organizations/memberships";
import { AnalyticsEngine } from "@server/platform/analytics-engine";
import { Auth } from "@server/platform/auth";
import { Autumn } from "@server/platform/autumn";
import { CallbackSender } from "@server/platform/callbacks";
import { CloudflareEnv } from "@server/platform/cloudflare";
import { AppConfig } from "@server/platform/config";
import { ContextDev } from "@server/platform/context-dev";
import { DatabaseLive } from "@server/platform/database";
import type { Env } from "@server/platform/env";
import { Mailer } from "@server/platform/mailer";
import { EventsQueue } from "@server/platform/queue";
import { SecretBox } from "@server/platform/secret-box";
import { Telemetry } from "@server/platform/telemetry";
import { WebPush } from "@server/platform/web-push";
import { TextModel } from "@server/platform/workers-ai";
import { Projects } from "@server/projects/projects";
import { PublicApi } from "@server/public-api/public-api";
import { PublicHttp } from "@server/public-api/router";
import { Retention } from "@server/retention/retention";
import { Milestones } from "@server/telemetry/milestones";
import { Layer } from "effect";

/**
 * The whole backend as one Layer, built once per Worker isolate from the
 * isolate's bindings. Tiers only depend on the tiers below them.
 */
export const makeAppLayer = (env: Env) => {
  const platform = Layer.mergeAll(
    AppConfig.layer,
    DatabaseLive,
    EventsQueue.layer,
    TextModel.layer
  ).pipe(Layer.provideMerge(CloudflareEnv.layer(env)));
  const adapters = Layer.mergeAll(
    Mailer.layer,
    WebPush.layer,
    AnalyticsEngine.layer,
    Autumn.layer,
    ContextDev.layer,
    SecretBox.layer,
    Telemetry.layer,
    CallbackSender.layer
  ).pipe(Layer.provideMerge(platform));
  const records = Layer.mergeAll(
    Memberships.layer,
    OrganizationBrands.layer,
    Projects.layer,
    Identities.layer,
    Idempotency.layer,
    Cards.layer
  ).pipe(Layer.provideMerge(adapters));
  // Billing reaches an organization's owner through its memberships.
  const billing = Billing.layer.pipe(Layer.provideMerge(records));
  // Push delivery sits between billing and auth, which extends a member's
  // devices to organizations they create or join.
  const delivery = Notifications.layer.pipe(Layer.provideMerge(billing));
  const domain = Layer.mergeAll(
    Channels.layer,
    EventStoreLive,
    Auth.layer,
    EmojiSuggester.layer,
    Milestones.layer,
    Callbacks.layer
  ).pipe(Layer.provideMerge(delivery));
  const product = Layer.mergeAll(ApiKeys.layer, Events.layer).pipe(
    Layer.provideMerge(domain)
  );
  const flows = Layer.mergeAll(
    GettingStartedFlow.layer,
    Retention.layer,
    PublicApi.layer,
    BillingEvents.layer,
    PushPreferencesFlow.layer
  ).pipe(Layer.provideMerge(product));
  const transports = McpServer.layer.pipe(Layer.provideMerge(flows));
  return PublicHttp.layer.pipe(Layer.provideMerge(transports));
};

export type AppLayer = ReturnType<typeof makeAppLayer>;
export type AppServices = Layer.Success<AppLayer>;
