import { Billing } from "@server/billing/billing";
import { describeFailure, infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { makeId } from "@server/platform/ids";
import { WebPush } from "@server/platform/web-push";
import type { PushPayload, PushTarget } from "@server/platform/web-push";
import type { EventCreatedMessage } from "@shared/queue";
import type { PushSettings } from "@shared/rpc/schemas";
import {
  Clock,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Schedule,
  Schema,
} from "effect";
import { SqlClient } from "effect/unstable/sql";

interface SubscriptionRow {
  readonly id: string;
  readonly user_id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly channel_ids: string;
  readonly updated_at: string;
}

/** This device's push subscription, as the browser hands it out now. */
export interface DeviceSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface SubscriptionInput {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly channelIds: readonly string[];
}

const ChannelIds = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeChannelIds = (value: string) =>
  Schema.decodeUnknownOption(ChannelIds)(value).pipe(
    Option.getOrElse((): readonly string[] => [])
  );
const encodeChannelIds = Schema.encodeSync(ChannelIds);

/** Push services may not recognise a registration for its first moments. */
const FRESH_MS = 5 * 60 * 1000;

const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/**
 * Web Push subscriptions per (organization, user, device endpoint). An empty
 * channel list means "every channel in this organization".
 */
export class Notifications extends Context.Service<
  Notifications,
  {
    readonly settings: (
      organizationId: string,
      userId: string,
      endpoint: string
    ) => Effect.Effect<PushSettings, InfrastructureError>;
    readonly subscribe: (
      organizationId: string,
      userId: string,
      input: SubscriptionInput
    ) => Effect.Effect<PushSettings, InfrastructureError>;
    readonly unsubscribe: (
      organizationId: string,
      userId: string,
      endpoint: string
    ) => Effect.Effect<void, InfrastructureError>;
    /**
     * The user created or joined an organization: every device that has push
     * on for them elsewhere gets it here too, for all channels.
     */
    readonly extendToOrganization: (
      organizationId: string,
      userId: string
    ) => Effect.Effect<void, InfrastructureError>;
    /**
     * Keeps a device's rows in step with the browser's subscription: rows
     * under `previousEndpoint` (a subscription the browser replaced) move to
     * the current one with their choices intact, and changed keys are
     * saved. Resolves to how many organizations the device has push on for.
     */
    readonly syncDevice: (
      userId: string,
      device: DeviceSubscription,
      previousEndpoint: string | undefined
    ) => Effect.Effect<number, InfrastructureError>;
    /** How many devices `userId` has push on for in the organization. */
    readonly deviceCount: (
      organizationId: string,
      userId: string
    ) => Effect.Effect<number, InfrastructureError>;
    readonly test: (
      organizationId: string,
      userId: string,
      appUrl: string
    ) => Effect.Effect<number, InfrastructureError>;
    /**
     * Pushes to every device subscribed in the organization, whatever its
     * channels and billing state: EmitKit's own notices (billing).
     */
    readonly announce: (
      organizationId: string,
      notice: {
        readonly title: string;
        readonly body: string;
        readonly tag: string;
        /** Path under the organization, e.g. `?settings=billing`. */
        readonly path: string;
      },
      appUrl: string
    ) => Effect.Effect<number, InfrastructureError>;
    /**
     * Queue consumer: pushes one created event to every matching
     * subscription, unless billing has paused the organization's pushes.
     */
    readonly deliver: (
      message: EventCreatedMessage,
      appUrl: string
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/notifications/Notifications") {
  static readonly layer = Layer.effect(
    Notifications,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const push = yield* WebPush;
      const billing = yield* Billing;

      const forget = (id: string) =>
        sql`delete from push_subscription where id = ${id}`.pipe(
          Effect.mapError(infrastructure("notifications.forget"))
        );

      /**
       * Sends to each target and returns the number of deliveries. Transient
       * push-service errors (429/5xx) are retried briefly. A push service can
       * also answer 404/410 for a registration made seconds ago, so a
       * subscription younger than FRESH_MS is retried and never deleted;
       * older ones that are gone are removed.
       */
      const fanOut = Effect.fn("Notifications.fanOut")(function* (
        rows: readonly SubscriptionRow[],
        payload: PushPayload
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        const outcomes = yield* Effect.forEach(
          rows,
          (row) => {
            const target: PushTarget = {
              auth: row.auth,
              endpoint: row.endpoint,
              p256dh: row.p256dh,
            };
            const ageMs =
              nowMs -
              DateTime.toEpochMillis(DateTime.makeUnsafe(row.updated_at));
            const fresh = ageMs < FRESH_MS;
            return push.send(target, payload).pipe(
              Effect.retry({
                schedule: Schedule.spaced("2 seconds"),
                times: 3,
                while: (error) => error._tag === "InfrastructureError" || fresh,
              }),
              Effect.as(1),
              Effect.catchTag("PushSubscriptionGoneError", () =>
                fresh
                  ? Effect.logWarning(
                      "new push subscription not yet reachable",
                      { id: row.id }
                    ).pipe(Effect.as(0))
                  : forget(row.id).pipe(Effect.as(0))
              ),
              Effect.catchTag("InfrastructureError", (error) =>
                Effect.logWarning(
                  "push delivery failed",
                  describeFailure(error)
                ).pipe(Effect.as(0))
              )
            );
          },
          { concurrency: 6 }
        );
        return outcomes.reduce((total, delivered) => total + delivered, 0);
      });

      const settings = Effect.fn("Notifications.settings")(function* (
        organizationId: string,
        userId: string,
        endpoint: string
      ) {
        const rows = yield* sql<SubscriptionRow>`
          select * from push_subscription where organization_id = ${organizationId} and user_id = ${userId} and endpoint = ${endpoint}
        `.pipe(Effect.mapError(infrastructure("notifications.settings")));
        const [row] = rows;
        return row
          ? { channelIds: decodeChannelIds(row.channel_ids), subscribed: true }
          : { channelIds: [], subscribed: false };
      });

      const subscribe = Effect.fn("Notifications.subscribe")(function* (
        organizationId: string,
        userId: string,
        input: SubscriptionInput
      ) {
        const id = yield* makeId("push");
        const timestamp = yield* now;
        yield* sql`
          insert into push_subscription ${sql.insert({
            auth: input.auth,
            channel_ids: encodeChannelIds(input.channelIds),
            created_at: timestamp,
            endpoint: input.endpoint,
            id,
            organization_id: organizationId,
            p256dh: input.p256dh,
            updated_at: timestamp,
            user_id: userId,
          })}
          on conflict (organization_id, user_id, endpoint) do update set
            auth = excluded.auth, p256dh = excluded.p256dh, channel_ids = excluded.channel_ids, updated_at = excluded.updated_at
        `.pipe(Effect.mapError(infrastructure("notifications.subscribe")));
        return { channelIds: [...input.channelIds], subscribed: true };
      });

      const unsubscribe = Effect.fn("Notifications.unsubscribe")(function* (
        organizationId: string,
        userId: string,
        endpoint: string
      ) {
        yield* sql`
          delete from push_subscription where organization_id = ${organizationId} and user_id = ${userId} and endpoint = ${endpoint}
        `.pipe(Effect.mapError(infrastructure("notifications.unsubscribe")));
      });

      const extendToOrganization = Effect.fn(
        "Notifications.extendToOrganization"
      )(function* (organizationId: string, userId: string) {
        const devices = yield* sql<{
          readonly endpoint: string;
          readonly p256dh: string;
          readonly auth: string;
        }>`
          select endpoint, max(p256dh) as p256dh, max(auth) as auth
          from push_subscription
          where user_id = ${userId} and organization_id != ${organizationId}
          group by endpoint
        `.pipe(Effect.mapError(infrastructure("notifications.extend")));
        yield* Effect.forEach(
          devices,
          (device) =>
            subscribe(organizationId, userId, { ...device, channelIds: [] }),
          { concurrency: 4, discard: true }
        );
      });

      const syncDevice = Effect.fn("Notifications.syncDevice")(function* (
        userId: string,
        device: DeviceSubscription,
        previousEndpoint: string | undefined
      ) {
        if (previousEndpoint && previousEndpoint !== device.endpoint) {
          // A new registration: its `updated_at` restarts the fresh window.
          const timestamp = yield* now;
          yield* sql`
            update or ignore push_subscription
            set endpoint = ${device.endpoint}, p256dh = ${device.p256dh}, auth = ${device.auth}, updated_at = ${timestamp}
            where user_id = ${userId} and endpoint = ${previousEndpoint}
          `.pipe(Effect.mapError(infrastructure("notifications.sync")));
          // Organizations that already had the new endpoint keep that row.
          yield* sql`
            delete from push_subscription where user_id = ${userId} and endpoint = ${previousEndpoint}
          `.pipe(Effect.mapError(infrastructure("notifications.sync")));
        }
        // Same registration: `updated_at` stays, so a dead subscription still
        // ages out of the fresh window and is removed.
        yield* sql`
          update push_subscription set p256dh = ${device.p256dh}, auth = ${device.auth}
          where user_id = ${userId} and endpoint = ${device.endpoint}
            and (p256dh != ${device.p256dh} or auth != ${device.auth})
        `.pipe(Effect.mapError(infrastructure("notifications.sync")));
        const rows = yield* sql<{ readonly organizations: number }>`
          select count(*) as organizations
          from push_subscription s
          join member m on m."organizationId" = s.organization_id and m."userId" = s.user_id
          where s.user_id = ${userId} and s.endpoint = ${device.endpoint}
        `.pipe(Effect.mapError(infrastructure("notifications.sync")));
        return rows[0]?.organizations ?? 0;
      });

      const deviceCount = Effect.fn("Notifications.deviceCount")(function* (
        organizationId: string,
        userId: string
      ) {
        const rows = yield* sql<{ readonly devices: number }>`
          select count(*) as devices from push_subscription
          where organization_id = ${organizationId} and user_id = ${userId}
        `.pipe(Effect.mapError(infrastructure("notifications.deviceCount")));
        return rows[0]?.devices ?? 0;
      });

      const test = Effect.fn("Notifications.test")(function* (
        organizationId: string,
        userId: string,
        appUrl: string
      ) {
        const rows = yield* sql<SubscriptionRow>`
          select * from push_subscription where organization_id = ${organizationId} and user_id = ${userId}
        `.pipe(Effect.mapError(infrastructure("notifications.test")));
        return yield* fanOut(rows, {
          body: "Push notifications are working on this device.",
          tag: "emitkit-test",
          title: "🔔 EmitKit test notification",
          url: `${appUrl}/`,
        });
      });

      const announce = Effect.fn("Notifications.announce")(function* (
        organizationId: string,
        notice: {
          readonly title: string;
          readonly body: string;
          readonly tag: string;
          readonly path: string;
        },
        appUrl: string
      ) {
        const rows = yield* sql<SubscriptionRow & { readonly slug: string }>`
          select s.*, o.slug as slug
          from push_subscription s
          join member m on m."organizationId" = s.organization_id and m."userId" = s.user_id
          join organization o on o.id = s.organization_id
          where s.organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("notifications.announce")));
        const [first] = rows;
        if (!first) {
          return 0;
        }
        return yield* fanOut(rows, {
          body: notice.body,
          tag: notice.tag,
          title: notice.title,
          url: `${appUrl}/${first.slug}${notice.path}`,
        });
      });

      const deliver = Effect.fn("Notifications.deliver")(function* (
        message: EventCreatedMessage,
        appUrl: string
      ) {
        if (!(yield* billing.pushAllowed(message.organizationId))) {
          yield* Effect.logInfo("push paused by billing", {
            organizationId: message.organizationId,
          });
          return 0;
        }
        const rows = yield* sql<
          SubscriptionRow & {
            readonly slug: string;
            readonly project_name: string;
            readonly channel_name: string;
          }
        >`
          select s.*, o.slug as slug, p.name as project_name, c.name as channel_name
          from push_subscription s
          join member m on m."organizationId" = s.organization_id and m."userId" = s.user_id
          join organization o on o.id = s.organization_id
          join project p on p.id = ${message.projectId}
          join channel c on c.id = ${message.channelId}
          where s.organization_id = ${message.organizationId}
        `.pipe(Effect.mapError(infrastructure("notifications.deliver")));
        const targets = rows.filter((row) => {
          const channels = decodeChannelIds(row.channel_ids);
          return channels.length === 0 || channels.includes(message.channelId);
        });
        const [first] = targets;
        if (!first) {
          return 0;
        }
        const title = message.icon
          ? `${message.icon} ${message.title}`
          : message.title;
        const context = `#${first.channel_name} · ${first.project_name}`;
        return yield* fanOut(targets, {
          body: message.description
            ? `${message.description}\n${context}`
            : context,
          tag: `event-${message.eventId}`,
          title,
          url: message.waits
            ? `${appUrl}/a/${message.eventId}`
            : `${appUrl}/${first.slug}?channelId=${message.channelId}`,
        });
      });

      return Notifications.of({
        announce,
        deliver,
        deviceCount,
        extendToOrganization,
        settings,
        subscribe,
        syncDevice,
        test,
        unsubscribe,
      });
    })
  );
}
