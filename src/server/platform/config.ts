import { CloudflareEnv } from "@server/platform/cloudflare";
import { Context, Effect, Layer, Redacted, Schema } from "effect";

export type EventStoreKind = "analytics-engine" | "d1";

export interface AppConfigValues {
  readonly appUrl: string;
  readonly apiUrl: string;
  /** Marketing site origin; null when the deployment serves no site (self-hosting default). */
  readonly siteUrl: string | null;
  /** Where the docs live: `<site>/docs`, or emitkit.com's when there is no site. */
  readonly docsUrl: string;
  readonly allowSignup: boolean;
  readonly emailFrom: string;
  readonly eventStore: EventStoreKind;
  readonly authSecret: Redacted.Redacted<string>;
  readonly vapid: {
    readonly publicKey: string;
    readonly privateKey: Redacted.Redacted<string>;
    readonly subject: string;
  };
  /** Hosted billing through Autumn; null (self-hosted) turns every paywall off. */
  readonly billing: {
    readonly secretKey: Redacted.Redacted<string>;
    readonly webhookSecret: Redacted.Redacted<string> | null;
  } | null;
  /**
   * Product telemetry for whoever runs this deployment (`Telemetry`): each
   * destination is off unless its keys are set, so self-hosted deployments
   * send nothing anywhere.
   */
  readonly telemetry: {
    readonly emitkitApiKey: Redacted.Redacted<string> | null;
    readonly openPanel: {
      readonly clientId: string;
      readonly clientSecret: Redacted.Redacted<string>;
      /** A self-hosted OpenPanel's API; null for OpenPanel Cloud. */
      readonly apiUrl: string | null;
    } | null;
  };
  /**
   * Context.dev key for brand lookups (the organization's logo and the
   * paywall's recipes); null turns them off.
   */
  readonly contextDevKey: Redacted.Redacted<string> | null;
  readonly analytics: {
    readonly accountId: string | null;
    readonly dataset: string;
    readonly token: Redacted.Redacted<string> | null;
  };
}

const Url = Schema.String.check(Schema.isStartsWith("http"));
const NonEmpty = Schema.String.check(Schema.isMinLength(1));

const RawConfig = Schema.Struct({
  AE_DATASET: Schema.optional(Schema.String),
  ALLOW_SIGNUP: Schema.optional(Schema.String),
  API_URL: Url,
  APP_URL: Url,
  AUTUMN_SECRET_KEY: Schema.optional(Schema.String),
  AUTUMN_WEBHOOK_SECRET: Schema.optional(Schema.String),
  BETTER_AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  CF_ACCOUNT_ID: Schema.optional(Schema.String),
  CF_ANALYTICS_TOKEN: Schema.optional(Schema.String),
  CONTEXT_DEV_API_KEY: Schema.optional(Schema.String),
  EMAIL_FROM: NonEmpty,
  EVENT_STORE: Schema.optional(Schema.Literals(["analytics-engine", "d1"])),
  SITE_URL: Schema.optional(Url),
  TELEMETRY_EMITKIT_API_KEY: Schema.optional(Schema.String),
  TELEMETRY_OPENPANEL_API_URL: Schema.optional(Url),
  TELEMETRY_OPENPANEL_CLIENT_ID: Schema.optional(Schema.String),
  TELEMETRY_OPENPANEL_CLIENT_SECRET: Schema.optional(Schema.String),
  VAPID_PRIVATE_KEY: NonEmpty,
  VAPID_PUBLIC_KEY: NonEmpty,
  VAPID_SUBJECT: NonEmpty,
});

export class ConfigError extends Schema.TaggedError<ConfigError>()(
  "ConfigError",
  {
    message: Schema.String,
  }
) {}

const trimSlash = (url: string) => url.replace(/\/+$/u, "");

/** The public docs, for deployments without a marketing site of their own. */
const HOSTED_DOCS_URL = "https://emitkit.com/docs";

/** Typed, validated configuration derived from Worker variables and secrets. */
export class AppConfig extends Context.Service<AppConfig, AppConfigValues>()(
  "emitkit/platform/AppConfig"
) {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const raw = yield* Schema.decodeUnknownEffect(RawConfig)(env).pipe(
        Effect.mapError(
          (error) =>
            new ConfigError({
              message: `Invalid Worker configuration: ${error.message}`,
            })
        )
      );
      const eventStore = raw.EVENT_STORE ?? "d1";
      if (
        eventStore === "analytics-engine" &&
        (!raw.CF_ACCOUNT_ID || !raw.CF_ANALYTICS_TOKEN)
      ) {
        return yield* new ConfigError({
          message:
            "EVENT_STORE=analytics-engine requires CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN",
        });
      }
      const siteUrl = raw.SITE_URL ? trimSlash(raw.SITE_URL) : null;
      return AppConfig.of({
        allowSignup: raw.ALLOW_SIGNUP !== "false",
        analytics: {
          accountId: raw.CF_ACCOUNT_ID ?? null,
          dataset: raw.AE_DATASET ?? "emitkit_events",
          token: raw.CF_ANALYTICS_TOKEN
            ? Redacted.make(raw.CF_ANALYTICS_TOKEN)
            : null,
        },
        apiUrl: trimSlash(raw.API_URL),
        billing: raw.AUTUMN_SECRET_KEY
          ? {
              secretKey: Redacted.make(raw.AUTUMN_SECRET_KEY),
              webhookSecret: raw.AUTUMN_WEBHOOK_SECRET
                ? Redacted.make(raw.AUTUMN_WEBHOOK_SECRET)
                : null,
            }
          : null,
        appUrl: trimSlash(raw.APP_URL),
        authSecret: Redacted.make(raw.BETTER_AUTH_SECRET),
        contextDevKey: raw.CONTEXT_DEV_API_KEY
          ? Redacted.make(raw.CONTEXT_DEV_API_KEY)
          : null,
        docsUrl: siteUrl ? `${siteUrl}/docs` : HOSTED_DOCS_URL,
        emailFrom: raw.EMAIL_FROM,
        eventStore,
        siteUrl,
        telemetry: {
          emitkitApiKey: raw.TELEMETRY_EMITKIT_API_KEY
            ? Redacted.make(raw.TELEMETRY_EMITKIT_API_KEY)
            : null,
          openPanel:
            raw.TELEMETRY_OPENPANEL_CLIENT_ID &&
            raw.TELEMETRY_OPENPANEL_CLIENT_SECRET
              ? {
                  apiUrl: raw.TELEMETRY_OPENPANEL_API_URL
                    ? trimSlash(raw.TELEMETRY_OPENPANEL_API_URL)
                    : null,
                  clientId: raw.TELEMETRY_OPENPANEL_CLIENT_ID,
                  clientSecret: Redacted.make(
                    raw.TELEMETRY_OPENPANEL_CLIENT_SECRET
                  ),
                }
              : null,
        },
        vapid: {
          privateKey: Redacted.make(raw.VAPID_PRIVATE_KEY),
          publicKey: raw.VAPID_PUBLIC_KEY,
          subject: raw.VAPID_SUBJECT,
        },
      });
    })
  );
}
