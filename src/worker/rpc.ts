import "@orpc/experimental-effect/extensions/effect";
import type { WithEffectContext } from "@orpc/experimental-effect";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ApiKeys } from "@server/api-keys/api-keys";
import type { AppServices } from "@server/app-layer";
import { Billing } from "@server/billing/billing";
import { BillingEvents } from "@server/billing/billing-events";
import { Cards, cardView } from "@server/cards/cards";
import { Channels } from "@server/channels/channels";
import { EmojiSuggester } from "@server/emoji/emoji";
import { describeFailure, InfrastructureError } from "@server/errors";
import { Events } from "@server/events/events";
import { GettingStartedFlow } from "@server/getting-started/getting-started";
import { Notifications } from "@server/notifications/notifications";
import { PushPreferencesFlow } from "@server/notifications/preferences";
import { OrganizationBrands } from "@server/organizations/brand";
import { Memberships } from "@server/organizations/memberships";
import type { Workspace } from "@server/organizations/memberships";
import { Auth } from "@server/platform/auth";
import type { SessionInfo } from "@server/platform/auth";
import { CallbackSender } from "@server/platform/callbacks";
import { AppConfig } from "@server/platform/config";
import type { Env } from "@server/platform/env";
import { Projects } from "@server/projects/projects";
import { contract } from "@shared/rpc/contract";
import { internalError } from "@worker/http";
import { appRuntime } from "@worker/runtime";
import { Effect, Redacted } from "effect";

interface RpcContext extends WithEffectContext<AppServices> {
  readonly headers: Headers;
  readonly session: SessionInfo | null;
}

type DomainError =
  | { readonly _tag: "NotFoundError"; readonly entity: string }
  | { readonly _tag: "ForbiddenError"; readonly message: string }
  | { readonly _tag: "ConflictError"; readonly message: string }
  | { readonly _tag: "InvalidInputError"; readonly message: string }
  | { readonly _tag: "UnauthenticatedError"; readonly message: string }
  | {
      readonly _tag: "InfrastructureError";
      readonly operation: string;
      readonly cause: unknown;
    };

/** Maps typed domain errors to oRPC's wire errors at the adapter boundary. */
const toRpcError = (error: DomainError) => {
  switch (error._tag) {
    case "NotFoundError": {
      return new ORPCError("NOT_FOUND", {
        message: `${error.entity} not found`,
      });
    }
    case "ForbiddenError": {
      return new ORPCError("FORBIDDEN", { message: error.message });
    }
    case "ConflictError": {
      return new ORPCError("CONFLICT", { message: error.message });
    }
    case "InvalidInputError": {
      return new ORPCError("BAD_REQUEST", { message: error.message });
    }
    case "UnauthenticatedError": {
      return new ORPCError("UNAUTHORIZED", { message: error.message });
    }
    default: {
      const { cause, operation } = describeFailure(
        new InfrastructureError({
          cause: error.cause,
          operation: error.operation,
        })
      );
      console.error("rpc infrastructure failure", operation, cause);
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Something went wrong",
      });
    }
  }
};

const requireSession = (context: RpcContext) =>
  context.session
    ? Effect.succeed(context.session)
    : Effect.fail(new ORPCError("UNAUTHORIZED", { message: "Sign in first" }));

/** The caller's active organization, verified against membership on every call. */
const requireWorkspace = (context: RpcContext) =>
  Effect.gen(function* () {
    const session = yield* requireSession(context);
    if (!session.activeOrganizationId) {
      return yield* Effect.fail(
        new ORPCError("FORBIDDEN", { message: "No workspace selected" })
      );
    }
    const memberships = yield* Memberships;
    const workspace = yield* memberships
      .workspace(session.userId, session.activeOrganizationId)
      .pipe(Effect.mapError(toRpcError));
    return { session, workspace };
  });

const requireManager = (
  workspace: Workspace,
  message = "Only owners and admins can manage API keys"
) =>
  workspace.role === "member"
    ? Effect.fail(new ORPCError("FORBIDDEN", { message }))
    : Effect.void;

const BILLING_MANAGERS = "Only owners and admins can manage billing";

const billingStatus = (workspace: Workspace, refresh: boolean) =>
  Effect.gen(function* () {
    const billing = yield* Billing;
    const status = yield* billing
      .status(workspace.organizationId, { refresh })
      .pipe(Effect.mapError(toRpcError));
    return { ...status, canManage: workspace.role !== "member" };
  });

const os = implement(contract).$context<RpcContext>();

const router = os.router({
  answers: {
    get: os.answers.get.effect(function* ({ context, input }) {
      const session = yield* requireSession(context);
      const cards = yield* Cards;
      const card = yield* cards
        .findForMember(session.userId, input.eventId)
        .pipe(Effect.mapError(toRpcError));
      return cardView(card);
    }),
    submit: os.answers.submit.effect(function* ({ context, input }) {
      const session = yield* requireSession(context);
      const events = yield* Events;
      const card = yield* events
        .answer(
          { email: session.email, name: session.name, userId: session.userId },
          input.eventId,
          { action: input.action, values: input.values }
        )
        .pipe(Effect.mapError(toRpcError));
      return cardView(card);
    }),
  },
  apiKeys: {
    create: os.apiKeys.create.effect(function* ({ context, input }) {
      const { session, workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace);
      const apiKeys = yield* ApiKeys;
      return yield* apiKeys
        .create(workspace.organizationId, session.userId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    list: os.apiKeys.list.effect(function* ({ context }) {
      const { workspace } = yield* requireWorkspace(context);
      const apiKeys = yield* ApiKeys;
      return yield* apiKeys
        .list(workspace.organizationId)
        .pipe(Effect.mapError(toRpcError));
    }),
    reveal: os.apiKeys.reveal.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace);
      const apiKeys = yield* ApiKeys;
      const secret = yield* apiKeys
        .reveal(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      return { secret };
    }),
    revoke: os.apiKeys.revoke.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace);
      const apiKeys = yield* ApiKeys;
      yield* apiKeys
        .revoke(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
    rotate: os.apiKeys.rotate.effect(function* ({ context, input }) {
      const { session, workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace);
      const apiKeys = yield* ApiKeys;
      return yield* apiKeys
        .rotate(workspace.organizationId, session.userId, input.id)
        .pipe(Effect.mapError(toRpcError));
    }),
  },
  billing: {
    checkout: os.billing.checkout.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace, BILLING_MANAGERS);
      const billing = yield* Billing;
      const config = yield* AppConfig;
      const url = yield* billing
        .checkout({
          organizationId: workspace.organizationId,
          planId: input.planId,
          successUrl:
            input.returnTo === "setup"
              ? `${config.appUrl}/${workspace.organizationSlug}?guide=setup&checkout=done`
              : `${config.appUrl}/${workspace.organizationSlug}?settings=billing`,
        })
        .pipe(Effect.mapError(toRpcError));
      return { url };
    }),
    portal: os.billing.portal.effect(function* ({ context }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace, BILLING_MANAGERS);
      const billing = yield* Billing;
      const config = yield* AppConfig;
      const url = yield* billing
        .portal(
          workspace.organizationId,
          `${config.appUrl}/${workspace.organizationSlug}?settings=billing`
        )
        .pipe(Effect.mapError(toRpcError));
      return { url };
    }),
    previewSeats: os.billing.previewSeats.effect(function* ({
      context,
      input,
    }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace, BILLING_MANAGERS);
      const billing = yield* Billing;
      return yield* billing
        .previewSeats(workspace.organizationId, input.seats)
        .pipe(Effect.mapError(toRpcError));
    }),
    setSeats: os.billing.setSeats.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(workspace, BILLING_MANAGERS);
      const billing = yield* Billing;
      yield* billing
        .setSeats(workspace.organizationId, input.seats)
        .pipe(Effect.mapError(toRpcError));
      return yield* billingStatus(workspace, false);
    }),
    status: os.billing.status.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      return yield* billingStatus(workspace, input.refresh ?? false);
    }),
  },
  channels: {
    create: os.channels.create.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const channels = yield* Channels;
      return yield* channels
        .create(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    list: os.channels.list.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const channels = yield* Channels;
      return yield* channels
        .list(workspace.organizationId, input.projectId)
        .pipe(Effect.mapError(toRpcError));
    }),
    remove: os.channels.remove.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const channels = yield* Channels;
      yield* channels
        .remove(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
    suggestEmoji: os.channels.suggestEmoji.effect(function* ({
      context,
      input,
    }) {
      yield* requireWorkspace(context);
      const suggester = yield* EmojiSuggester;
      return { emoji: yield* suggester.suggest(input.name) };
    }),
    update: os.channels.update.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const channels = yield* Channels;
      return yield* channels
        .update(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
  },
  events: {
    list: os.events.list.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const events = yield* Events;
      return yield* events
        .list(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    pulse: os.events.pulse.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const events = yield* Events;
      return yield* events
        .pulse(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    remove: os.events.remove.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const events = yield* Events;
      yield* events
        .remove(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
  },
  gettingStarted: {
    bootstrap: os.gettingStarted.bootstrap.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const flow = yield* GettingStartedFlow;
      return yield* flow
        .bootstrap(context.headers, session, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    ensureWorkspace: os.gettingStarted.ensureWorkspace.effect(function* ({
      context,
    }) {
      const session = yield* requireSession(context);
      const flow = yield* GettingStartedFlow;
      return yield* flow
        .ensureWorkspace(context.headers, session)
        .pipe(Effect.mapError(toRpcError));
    }),
    sendTestEvent: os.gettingStarted.sendTestEvent.effect(function* ({
      context,
    }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const flow = yield* GettingStartedFlow;
      return yield* flow.sendTestEvent(session, workspace.organizationId).pipe(
        // A fixed, small event: too large can't happen.
        Effect.catchTag("EventTooLargeError", (tooLarge) =>
          Effect.die(tooLarge)
        ),
        Effect.mapError(toRpcError)
      );
    }),
    status: os.gettingStarted.status.effect(function* ({ context }) {
      const session = yield* requireSession(context);
      const flow = yield* GettingStartedFlow;
      return yield* flow.status(session).pipe(Effect.mapError(toRpcError));
    }),
  },
  notifications: {
    disableEverywhere: os.notifications.disableEverywhere.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const preferences = yield* PushPreferencesFlow;
      yield* preferences
        .disableEverywhere(session.userId, input.endpoint)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
    enableEverywhere: os.notifications.enableEverywhere.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const preferences = yield* PushPreferencesFlow;
      return yield* preferences
        .enableEverywhere(session, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    preferences: os.notifications.preferences.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const preferences = yield* PushPreferencesFlow;
      return yield* preferences
        .get(session.userId, input.endpoint)
        .pipe(Effect.mapError(toRpcError));
    }),
    setOrganization: os.notifications.setOrganization.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const preferences = yield* PushPreferencesFlow;
      return yield* preferences
        .setOrganization(session.userId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    get: os.notifications.get.effect(function* ({ context, input }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const notifications = yield* Notifications;
      return yield* notifications
        .settings(workspace.organizationId, session.userId, input.endpoint)
        .pipe(Effect.mapError(toRpcError));
    }),
    publicKey: os.notifications.publicKey.effect(function* () {
      const config = yield* AppConfig;
      return { publicKey: config.vapid.publicKey };
    }),
    subscribe: os.notifications.subscribe.effect(function* ({
      context,
      input,
    }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const notifications = yield* Notifications;
      return yield* notifications
        .subscribe(workspace.organizationId, session.userId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    syncDevice: os.notifications.syncDevice.effect(function* ({
      context,
      input,
    }) {
      const session = yield* requireSession(context);
      const notifications = yield* Notifications;
      const { previousEndpoint, ...device } = input;
      const organizations = yield* notifications
        .syncDevice(session.userId, device, previousEndpoint)
        .pipe(Effect.mapError(toRpcError));
      return { organizations };
    }),
    test: os.notifications.test.effect(function* ({ context }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const notifications = yield* Notifications;
      const config = yield* AppConfig;
      const delivered = yield* notifications
        .test(workspace.organizationId, session.userId, config.appUrl)
        .pipe(Effect.mapError(toRpcError));
      return { delivered };
    }),
    unsubscribe: os.notifications.unsubscribe.effect(function* ({
      context,
      input,
    }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const notifications = yield* Notifications;
      yield* notifications
        .unsubscribe(workspace.organizationId, session.userId, input.endpoint)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
  },
  projects: {
    callbackSecret: os.projects.callbackSecret.effect(function* ({
      context,
      input,
    }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(
        workspace,
        "Only owners and admins can see the callback secret"
      );
      const projects = yield* Projects;
      const sender = yield* CallbackSender;
      yield* projects
        .get(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      const secret = yield* sender
        .secret(input.id)
        .pipe(Effect.mapError(toRpcError));
      return { secret: Redacted.value(secret) };
    }),
    create: os.projects.create.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const projects = yield* Projects;
      return yield* projects
        .create(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
    list: os.projects.list.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const projects = yield* Projects;
      return yield* projects
        .list(workspace.organizationId, input.includeDeleted ?? false)
        .pipe(Effect.mapError(toRpcError));
    }),
    remove: os.projects.remove.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const projects = yield* Projects;
      yield* projects
        .remove(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
      return { ok: true };
    }),
    restore: os.projects.restore.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const projects = yield* Projects;
      return yield* projects
        .restore(workspace.organizationId, input.id)
        .pipe(Effect.mapError(toRpcError));
    }),
    update: os.projects.update.effect(function* ({ context, input }) {
      const { workspace } = yield* requireWorkspace(context);
      const projects = yield* Projects;
      return yield* projects
        .update(workspace.organizationId, input)
        .pipe(Effect.mapError(toRpcError));
    }),
  },
  workspace: {
    brand: os.workspace.brand.effect(function* ({ context }) {
      const { session, workspace } = yield* requireWorkspace(context);
      const brands = yield* OrganizationBrands;
      return yield* brands
        .get({
          canManage: workspace.role !== "member",
          organizationId: workspace.organizationId,
          organizationName: workspace.organizationName,
          session,
        })
        .pipe(Effect.mapError(toRpcError));
    }),
    current: os.workspace.current.effect(function* ({ context }) {
      const { workspace } = yield* requireWorkspace(context);
      return workspace;
    }),
    lookupBrand: os.workspace.lookupBrand.effect(function* ({
      context,
      input,
    }) {
      const { workspace } = yield* requireWorkspace(context);
      yield* requireManager(
        workspace,
        "Only owners and admins can change the organization's brand"
      );
      const brands = yield* OrganizationBrands;
      return yield* brands
        .lookup({
          organizationId: workspace.organizationId,
          website: input.website,
        })
        .pipe(Effect.mapError(toRpcError));
    }),
  },
});

const handler = new RPCHandler(router);

/** Dashboard RPC (`/rpc/*` on the app host), authenticated by the Better Auth session cookie. */
export const handleRpc = async (request: Request, env: Env) => {
  try {
    const runtime = await appRuntime(env);
    const session = await runtime.runPromise(
      Auth.use((auth) => auth.session(request.headers))
    );
    const { matched, response } = await handler.handle(request, {
      context: {
        "effect/context": await runtime.context(),
        headers: request.headers,
        session,
      },
      prefix: "/rpc",
    });
    return matched
      ? response
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return internalError(error);
  }
};

/** Autumn's billing webhook (`POST /api/billing/webhook` on the app host). */
export const handleBillingWebhook = async (request: Request, env: Env) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const runtime = await appRuntime(env);
    const body = await request.text();
    const outcome = await runtime.runPromise(
      BillingEvents.use((events) => events.receive(request.headers, body))
    );
    return outcome === "unauthorized"
      ? Response.json({ error: "Invalid signature" }, { status: 401 })
      : new Response(null, { status: 204 });
  } catch (error) {
    return internalError(error);
  }
};

/** Better Auth routes (`/api/auth/*` on the app host). */
export const handleAuth = async (request: Request, env: Env) => {
  try {
    const runtime = await appRuntime(env);
    return await runtime.runPromise(Auth.use((auth) => auth.handle(request)));
  } catch (error) {
    return internalError(error);
  }
};
