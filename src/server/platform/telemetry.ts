import { describeFailure, infrastructure } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import type { AppConfigValues } from "@server/platform/config";
import {
  pushChannels,
  pushedEventNames,
  telemetryEvents,
} from "@server/telemetry/events";
import type {
  TelemetryEventName,
  TelemetryProperties,
} from "@server/telemetry/events";
import { isTestAccount } from "@shared/test-accounts";
import { EmitKitServerProvider } from "@trakoo/emitkit/server";
import { OpenPanelServerProvider } from "@trakoo/openpanel/server";
import { waitUntil } from "cloudflare:workers";
import { Context, Effect, Layer, Redacted } from "effect";
import { typed } from "trakoo";
import type { ProviderConfigOrProvider } from "trakoo";
import { createServerAnalytics } from "trakoo/server";
import type { ServerTrackOptions } from "trakoo/server";

/** Who an event is about: the signed-in user, or an organization's owner. */
export interface TelemetryActor {
  readonly userId: string;
  readonly email: string;
  /** The request the event came from; its IP and user agent place the visitor. */
  readonly headers?: Headers | null | undefined;
}

const WHITESPACE = /\s+/u;

/** Profile fields: OpenPanel reads the names and email, EmitKit keeps all. */
interface UserTraits {
  readonly email: string;
  readonly name: string;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
}

type TrackOptions = ServerTrackOptions<UserTraits>;

/** The request an actor came from; its IP and user agent place the visitor. */
const requestContext = (actor: TelemetryActor) => ({
  server: {
    ip: actor.headers?.get("cf-connecting-ip") ?? undefined,
    userAgent: actor.headers?.get("user-agent") ?? undefined,
  },
});

const trackOptions = (actor: TelemetryActor): TrackOptions => ({
  context: requestContext(actor),
  user: { email: actor.email },
  userId: actor.userId,
});

/** trakoo providers for the destinations whose keys are set. */
const destinations = (
  telemetry: AppConfigValues["telemetry"]
): ProviderConfigOrProvider[] => [
  ...(telemetry.emitkitApiKey
    ? [
        {
          events: [...pushedEventNames],
          provider: new EmitKitServerProvider({
            apiKey: Redacted.value(telemetry.emitkitApiKey),
            categoryChannelMap: pushChannels,
            displayAs: "notification",
            notify: true,
          }),
        },
      ]
    : []),
  ...(telemetry.openPanel
    ? [
        new OpenPanelServerProvider({
          apiUrl: telemetry.openPanel.apiUrl ?? undefined,
          clientId: telemetry.openPanel.clientId,
          clientSecret: Redacted.value(telemetry.openPanel.clientSecret),
        }),
      ]
    : []),
];

/**
 * Product telemetry for whoever runs this deployment, through trakoo: every
 * event goes to OpenPanel, and the ones worth a push (signups, billing,
 * milestones, churn) to EmitKit, which is EmitKit notifying its operator
 * about EmitKit. Destinations are configured by their keys; with none (the
 * self-hosting default) this is a no-op that loads no SDK.
 *
 * Delivery runs after the response (`waitUntil`) and never fails the caller:
 * telemetry must not slow down or break a sign-up or a webhook.
 */
export class Telemetry extends Context.Service<
  Telemetry,
  {
    readonly enabled: boolean;
    readonly track: <Name extends TelemetryEventName>(
      name: Name,
      properties: TelemetryProperties[Name],
      actor: TelemetryActor | null
    ) => Effect.Effect<void>;
    /** Names the user: an EmitKit identity and an OpenPanel profile. */
    readonly identify: (
      actor: TelemetryActor & { readonly name: string }
    ) => Effect.Effect<void>;
    /** Runs telemetry work after the response; failures are logged, not raised. */
    readonly background: (
      label: string,
      work: Effect.Effect<void, unknown>
    ) => Effect.Effect<void>;
  }
>()("emitkit/platform/Telemetry") {
  static readonly disabled = Telemetry.of({
    background: () => Effect.void,
    enabled: false,
    identify: () => Effect.void,
    track: () => Effect.void,
  });

  static readonly layer = Layer.effect(
    Telemetry,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const providers = destinations(config.telemetry);
      if (providers.length === 0) {
        return Telemetry.disabled;
      }
      const analytics = createServerAnalytics({
        events: telemetryEvents,
        providers,
        userTraits: typed<UserTraits>(),
      });
      // Loads the provider SDKs; no network. A failure turns telemetry off
      // rather than failing the layer, which would fail every request.
      const ready = yield* Effect.tryPromise({
        catch: infrastructure("telemetry.initialize"),
        try: () => analytics.initialize(),
      }).pipe(
        Effect.as(true),
        Effect.catchTag("InfrastructureError", (failure) =>
          Effect.logError(
            "telemetry initialization failed; telemetry is off",
            describeFailure(failure)
          ).pipe(Effect.as(false))
        )
      );
      if (!ready) {
        return Telemetry.disabled;
      }
      // trakoo types `track` per event name, which TypeScript can't resolve
      // for a generic one; `track` below checks the name and properties.
      const deliver: (
        name: TelemetryEventName,
        properties: TelemetryProperties[TelemetryEventName],
        options: TrackOptions | undefined
      ) => Promise<void> = analytics.track.bind(analytics);
      const run = Effect.runPromiseWith(yield* Effect.context<never>());

      const background = (label: string, work: Effect.Effect<void, unknown>) =>
        Effect.sync(() =>
          waitUntil(
            run(
              work.pipe(
                Effect.catchCause((cause) =>
                  Effect.logWarning(`${label} failed`, cause)
                )
              )
            )
          )
        );

      const send = (label: string, request: () => Promise<void>) =>
        background(
          label,
          Effect.tryPromise({ catch: infrastructure(label), try: request })
        );

      const track = <Name extends TelemetryEventName>(
        name: Name,
        properties: TelemetryProperties[Name],
        actor: TelemetryActor | null
      ) => {
        if (actor && isTestAccount(actor.email)) {
          return Effect.void;
        }
        return send(`telemetry.track.${name}`, () =>
          deliver(name, properties, actor ? trackOptions(actor) : undefined)
        );
      };

      const identify = (actor: TelemetryActor & { readonly name: string }) => {
        if (isTestAccount(actor.email)) {
          return Effect.void;
        }
        const [firstName, ...rest] = actor.name.trim().split(WHITESPACE);
        return send("telemetry.identify", () =>
          // OpenPanel places the profile where this request came from, so
          // without the user's request every profile lands at the Worker.
          analytics.identify(
            actor.userId,
            {
              email: actor.email,
              firstName: firstName || undefined,
              lastName: rest.join(" ") || undefined,
              name: actor.name,
            },
            { context: requestContext(actor) }
          )
        );
      };

      return Telemetry.of({ background, enabled: true, identify, track });
    })
  );
}
