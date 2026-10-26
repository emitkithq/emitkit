import { ApiKeys } from "@server/api-keys/api-keys";
import type {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@server/errors";
import { Events } from "@server/events/events";
import type { EventTooLargeError } from "@server/events/events";
import { Notifications } from "@server/notifications/notifications";
import { Memberships } from "@server/organizations/memberships";
import { Auth } from "@server/platform/auth";
import type { SessionInfo } from "@server/platform/auth";
import { makeId } from "@server/platform/ids";
import { Telemetry } from "@server/platform/telemetry";
import { Projects } from "@server/projects/projects";
import { slugify } from "@server/slug";
import type {
  BootstrapResult,
  GettingStarted,
  WorkspaceRef,
} from "@shared/rpc/schemas";
import { Context, Effect, Layer } from "effect";

export interface BootstrapInput {
  readonly organizationName: string;
  readonly projectName: string;
  readonly websiteUrl?: string | undefined;
}

const WHITESPACE = /\s+/u;

/** "Ada Lovelace" → "Ada's workspace"; falls back to the email's local part. */
const workspaceName = (session: SessionInfo) => {
  const [first] = session.name.trim().split(WHITESPACE);
  const who = first || session.email.split("@")[0] || "My";
  return `${who}'s workspace`;
};

/**
 * First run. A new user lands straight in a workspace made for them (an
 * organization, a project and a starter key), and the dashboard's setup guide
 * walks them through their key, a first event and their phone.
 */
export class GettingStartedFlow extends Context.Service<
  GettingStartedFlow,
  {
    readonly status: (
      session: SessionInfo
    ) => Effect.Effect<GettingStarted, InfrastructureError>;
    /** The user's first organization, or a new one when they have none. */
    readonly ensureWorkspace: (
      headers: Headers,
      session: SessionInfo
    ) => Effect.Effect<
      WorkspaceRef,
      NotFoundError | ForbiddenError | InfrastructureError
    >;
    readonly bootstrap: (
      headers: Headers,
      session: SessionInfo,
      input: BootstrapInput
    ) => Effect.Effect<
      BootstrapResult,
      NotFoundError | ForbiddenError | InfrastructureError
    >;
    /** Sends a real event (notify on) into the organization's first project. */
    readonly sendTestEvent: (
      session: SessionInfo,
      organizationId: string
    ) => Effect.Effect<
      { readonly eventId: string; readonly channelId: string },
      NotFoundError | ForbiddenError | EventTooLargeError | InfrastructureError
    >;
  }
>()("emitkit/getting-started/GettingStartedFlow") {
  static readonly layer = Layer.effect(
    GettingStartedFlow,
    Effect.gen(function* () {
      const auth = yield* Auth;
      const memberships = yield* Memberships;
      const projects = yield* Projects;
      const apiKeys = yield* ApiKeys;
      const events = yield* Events;
      const notifications = yield* Notifications;
      const telemetry = yield* Telemetry;

      const empty = {
        apiKey: null,
        devices: 0,
        firstEventAt: null,
        organizationId: null,
        project: null,
        stage: "setup",
      } satisfies GettingStarted;

      const status = Effect.fn("GettingStarted.status")(function* (
        session: SessionInfo
      ): Effect.fn.Return<GettingStarted, InfrastructureError> {
        const organizationId =
          session.activeOrganizationId ??
          (yield* memberships.firstOrganizationId(session.userId));
        if (!organizationId) {
          return empty;
        }
        const member = yield* memberships
          .workspace(session.userId, organizationId)
          .pipe(Effect.option);
        if (member._tag === "None") {
          return empty;
        }
        const [live, keys, devices] = yield* Effect.all(
          [
            projects.list(organizationId, false),
            apiKeys.list(organizationId),
            notifications.deviceCount(organizationId, session.userId),
          ],
          { concurrency: 3 }
        );
        const firstEventAt =
          live
            .map((candidate) => candidate.firstEventAt)
            .filter((value) => value !== null)
            .toSorted()[0] ?? null;
        return {
          apiKey: keys.find((key) => key.revealable && key.enabled) ?? null,
          devices,
          firstEventAt,
          organizationId,
          project: live[0] ?? null,
          stage: firstEventAt ? "complete" : "send_event",
        };
      });

      const bootstrap = Effect.fn("GettingStarted.bootstrap")(function* (
        headers: Headers,
        session: SessionInfo,
        input: BootstrapInput
      ) {
        const suffix = (yield* makeId("x")).slice(2, 8);
        const organization = yield* auth.createOrganization(headers, {
          name: input.organizationName.trim(),
          slug: `${slugify(input.organizationName, "workspace")}-${suffix}`,
        });
        const initial = yield* projects.ensureDefault(organization.id);
        const project = yield* projects.update(organization.id, {
          id: initial.id,
          name: input.projectName,
          url: input.websiteUrl?.trim() || null,
        });
        const apiKey = yield* apiKeys.create(organization.id, session.userId, {
          name: "Starter key",
          projectId: project.id,
        });
        return {
          apiKey,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          project,
        };
      });

      const ensureWorkspace = Effect.fn("GettingStarted.ensureWorkspace")(
        function* (headers: Headers, session: SessionInfo) {
          const existing = yield* memberships.firstOrganizationId(
            session.userId
          );
          if (existing) {
            const workspace = yield* memberships.workspace(
              session.userId,
              existing
            );
            return {
              organizationId: existing,
              organizationSlug: workspace.organizationSlug,
            };
          }
          const created = yield* bootstrap(headers, session, {
            organizationName: workspaceName(session),
            projectName: "My app",
          });
          return {
            organizationId: created.organizationId,
            organizationSlug: created.organizationSlug,
          };
        }
      );

      const sendTestEvent = Effect.fn("GettingStarted.sendTestEvent")(
        function* (session: SessionInfo, organizationId: string) {
          const live = yield* projects.list(organizationId, false);
          const project =
            live[0] ?? (yield* projects.ensureDefault(organizationId));
          const created = yield* events.ingest(
            { organizationId, projectId: project.id },
            {
              channelName: "welcome",
              description:
                "Sent from the dashboard. Events from your app land here the same way.",
              icon: "🎉",
              notify: true,
              source: "dashboard",
              tags: ["test"],
              title: "Your first event",
            }
          );
          yield* telemetry.track(
            "test_event_sent",
            { organizationId },
            session
          );
          return {
            channelId: created.event.channelId,
            eventId: created.event.id,
          };
        }
      );

      return GettingStartedFlow.of({
        bootstrap,
        ensureWorkspace,
        sendTestEvent,
        status,
      });
    })
  );
}
