import { Channels } from "@server/channels/channels";
import type { InfrastructureError, NotFoundError } from "@server/errors";
import { Notifications } from "@server/notifications/notifications";
import { Memberships } from "@server/organizations/memberships";
import type { SessionInfo } from "@server/platform/auth";
import { Telemetry } from "@server/platform/telemetry";
import { Projects } from "@server/projects/projects";
import type { PushPreferences } from "@shared/rpc/schemas";
import { Context, Effect, Layer } from "effect";

export interface PushDevice {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Push preferences for one device across every organization its user
 * belongs to. The app is one PWA per device, so turning push on for the
 * device turns it on everywhere (all channels), and each organization can
 * then be switched off or narrowed to some channels. Delivery still goes
 * through the per-organization subscriptions in `Notifications`.
 */
export class PushPreferencesFlow extends Context.Service<
  PushPreferencesFlow,
  {
    readonly get: (
      userId: string,
      endpoint: string
    ) => Effect.Effect<PushPreferences, InfrastructureError>;
    /** Push on for this device in every organization, all channels. */
    readonly enableEverywhere: (
      user: Pick<SessionInfo, "userId" | "email">,
      device: PushDevice
    ) => Effect.Effect<PushPreferences, InfrastructureError>;
    readonly disableEverywhere: (
      userId: string,
      endpoint: string
    ) => Effect.Effect<void, InfrastructureError>;
    /** One organization on or off (or narrowed to channels); checks membership. */
    readonly setOrganization: (
      userId: string,
      input: PushDevice & {
        readonly organizationId: string;
        readonly enabled: boolean;
        readonly channelIds: readonly string[];
      }
    ) => Effect.Effect<PushPreferences, NotFoundError | InfrastructureError>;
  }
>()("emitkit/notifications/PushPreferencesFlow") {
  static readonly layer = Layer.effect(
    PushPreferencesFlow,
    Effect.gen(function* () {
      const memberships = yield* Memberships;
      const notifications = yield* Notifications;
      const projects = yield* Projects;
      const channels = yield* Channels;
      const telemetry = yield* Telemetry;

      const get = Effect.fn("PushPreferences.get")(function* (
        userId: string,
        endpoint: string
      ) {
        const workspaces = yield* memberships.workspaces(userId);
        const organizations = yield* Effect.forEach(
          workspaces,
          (workspace) =>
            Effect.gen(function* () {
              const [settings, live, all] = yield* Effect.all(
                [
                  notifications.settings(
                    workspace.organizationId,
                    userId,
                    endpoint
                  ),
                  projects.list(workspace.organizationId, false),
                  channels.list(workspace.organizationId),
                ],
                { concurrency: 3 }
              );
              return {
                channelIds: [...settings.channelIds],
                organizationId: workspace.organizationId,
                organizationName: workspace.organizationName,
                organizationSlug: workspace.organizationSlug,
                projects: live.map((project) => ({
                  channels: all
                    .filter((channel) => channel.projectId === project.id)
                    .map((channel) => ({
                      icon: channel.icon,
                      id: channel.id,
                      name: channel.name,
                    })),
                  id: project.id,
                  name: project.name,
                })),
                subscribed: settings.subscribed,
              };
            }),
          { concurrency: 4 }
        );
        return { organizations };
      });

      const enableEverywhere = Effect.fn("PushPreferences.enableEverywhere")(
        function* (
          user: Pick<SessionInfo, "userId" | "email">,
          device: PushDevice
        ) {
          const workspaces = yield* memberships.workspaces(user.userId);
          yield* Effect.forEach(
            workspaces,
            (workspace) =>
              notifications.subscribe(workspace.organizationId, user.userId, {
                ...device,
                channelIds: [],
              }),
            { concurrency: 4, discard: true }
          );
          yield* telemetry.track(
            "push_enabled",
            { organizations: workspaces.length },
            user
          );
          return yield* get(user.userId, device.endpoint);
        }
      );

      const disableEverywhere = Effect.fn("PushPreferences.disableEverywhere")(
        function* (userId: string, endpoint: string) {
          const workspaces = yield* memberships.workspaces(userId);
          yield* Effect.forEach(
            workspaces,
            (workspace) =>
              notifications.unsubscribe(
                workspace.organizationId,
                userId,
                endpoint
              ),
            { concurrency: 4, discard: true }
          );
        }
      );

      const setOrganization = Effect.fn("PushPreferences.setOrganization")(
        function* (
          userId: string,
          input: PushDevice & {
            readonly organizationId: string;
            readonly enabled: boolean;
            readonly channelIds: readonly string[];
          }
        ) {
          // Only organizations the user belongs to; NotFound otherwise.
          yield* memberships.workspace(userId, input.organizationId);
          yield* input.enabled
            ? Effect.asVoid(
                notifications.subscribe(input.organizationId, userId, {
                  auth: input.auth,
                  channelIds: input.channelIds,
                  endpoint: input.endpoint,
                  p256dh: input.p256dh,
                })
              )
            : notifications.unsubscribe(
                input.organizationId,
                userId,
                input.endpoint
              );
          return yield* get(userId, input.endpoint);
        }
      );

      return PushPreferencesFlow.of({
        disableEverywhere,
        enableEverywhere,
        get,
        setOrganization,
      });
    })
  );
}
