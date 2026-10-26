/**
 * EmitKit infrastructure: one Worker plus the Cloudflare resources it binds.
 *
 *   pnpm build && pnpm exec alchemy deploy --stage prod --env-file .env.local
 *
 * Configuration comes from environment variables (see docs/content/self-hosting/configuration.md).
 * Secrets the product owns (Better Auth secret, VAPID key) are generated once
 * by Alchemy and kept in its state; nothing secret lives in this file. State
 * lives in the Cloudflare account (the `alchemy-state-store` Worker), so any
 * machine or Workers Builds run with a deploy token sees the same deployment.
 */
import { createECDH } from "node:crypto";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const env = (name: string, fallback: string) =>
  process.env[name]?.trim() || fallback;

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required (see docs/content/self-hosting/configuration.md)`
    );
  }
  return value;
};

/** Zone that serves every hostname below. */
const DOMAIN = required("EMITKIT_DOMAIN");
/** Hostnames per surface; override to deploy under other names (e.g. staging-*). */
const APP_HOST = env("EMITKIT_APP_HOST", `app.${DOMAIN}`);
const API_HOST = env("EMITKIT_API_HOST", `api.${DOMAIN}`);
/**
 * The marketing site and docs (emitkit.com's). Unset, the default, the Worker
 * serves only the app and API, so no other hostname in the zone is touched.
 */
const SITE_HOST = env("EMITKIT_SITE_HOST", "");
/** Extra hostnames that 301 to the site (e.g. www). Comma-separated; empty disables. */
const REDIRECT_HOSTS = SITE_HOST
  ? (process.env.EMITKIT_REDIRECT_HOSTS ?? `www.${DOMAIN}`)
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  : [];
/** Old docs hostname that 301s to <site>/docs/<path>; empty disables. */
const DOCS_HOST = SITE_HOST
  ? (process.env.EMITKIT_DOCS_HOST ?? `docs.${DOMAIN}`).trim()
  : "";
const MAIL_DOMAIN = env("EMITKIT_MAIL_DOMAIN", `mail.${DOMAIN}`);
const EMAIL_FROM = env("EMITKIT_EMAIL_FROM", `noreply@${MAIL_DOMAIN}`);
const NAME = env("EMITKIT_WORKER_NAME", "emitkit");
const DATASET = env("EMITKIT_AE_DATASET", "emitkit_events");
const ALLOW_SIGNUP = env("EMITKIT_ALLOW_SIGNUP", "true");
/**
 * Where events live: `analytics-engine` (queryable history, needs the minted
 * read token) or `d1` (90 days in the database, no extra token).
 */
const EVENT_STORE = env("EMITKIT_EVENT_STORE", "analytics-engine");
if (EVENT_STORE !== "analytics-engine" && EVENT_STORE !== "d1") {
  throw new Error("EMITKIT_EVENT_STORE must be analytics-engine or d1");
}
const ANALYTICS_ENGINE = EVENT_STORE === "analytics-engine";
/** Workers AI suggests channel emoji; `false` falls back to keyword matching. */
const AI = env("EMITKIT_AI", "true") !== "false";
/** Publishable Parsew key for brand icons; empty turns them off. */
const PARSEW_KEY = env("EMITKIT_PARSEW_KEY", "");
const VAPID_SUBJECT = env("EMITKIT_VAPID_SUBJECT", `mailto:hi@${DOMAIN}`);
/**
 * Hosted billing (Autumn). Unset, as for any self-hosted deployment, and
 * nothing is gated. The webhook secret is the Autumn endpoint's `whsec_…`.
 */
const AUTUMN_SECRET_KEY = env("EMITKIT_AUTUMN_SECRET_KEY", "");
const AUTUMN_WEBHOOK_SECRET = env("EMITKIT_AUTUMN_WEBHOOK_SECRET", "");
const billingSecrets = {
  ...(AUTUMN_SECRET_KEY
    ? { AUTUMN_SECRET_KEY: Redacted.make(AUTUMN_SECRET_KEY) }
    : {}),
  ...(AUTUMN_WEBHOOK_SECRET
    ? { AUTUMN_WEBHOOK_SECRET: Redacted.make(AUTUMN_WEBHOOK_SECRET) }
    : {}),
};

/**
 * Product telemetry for the operator (trakoo): pushes for signups, billing,
 * milestones and churn to an EmitKit project, and every event to OpenPanel.
 * Each destination is off while its keys are empty, as for self-hosting.
 */
const TELEMETRY_EMITKIT_API_KEY = env("EMITKIT_TELEMETRY_EMITKIT_API_KEY", "");
const TELEMETRY_OPENPANEL_CLIENT_ID = env(
  "EMITKIT_TELEMETRY_OPENPANEL_CLIENT_ID",
  ""
);
const TELEMETRY_OPENPANEL_CLIENT_SECRET = env(
  "EMITKIT_TELEMETRY_OPENPANEL_CLIENT_SECRET",
  ""
);
/** A self-hosted OpenPanel's API; empty sends to OpenPanel Cloud. */
const TELEMETRY_OPENPANEL_API_URL = env(
  "EMITKIT_TELEMETRY_OPENPANEL_API_URL",
  ""
);
if (
  Boolean(TELEMETRY_OPENPANEL_CLIENT_ID) !==
  Boolean(TELEMETRY_OPENPANEL_CLIENT_SECRET)
) {
  throw new Error(
    "Set both EMITKIT_TELEMETRY_OPENPANEL_CLIENT_ID and EMITKIT_TELEMETRY_OPENPANEL_CLIENT_SECRET, or neither"
  );
}
const telemetrySettings = {
  ...(TELEMETRY_EMITKIT_API_KEY
    ? { TELEMETRY_EMITKIT_API_KEY: Redacted.make(TELEMETRY_EMITKIT_API_KEY) }
    : {}),
  ...(TELEMETRY_OPENPANEL_CLIENT_ID
    ? {
        ...(TELEMETRY_OPENPANEL_API_URL ? { TELEMETRY_OPENPANEL_API_URL } : {}),
        TELEMETRY_OPENPANEL_CLIENT_ID,
        TELEMETRY_OPENPANEL_CLIENT_SECRET: Redacted.make(
          TELEMETRY_OPENPANEL_CLIENT_SECRET
        ),
      }
    : {}),
};

/**
 * Context.dev key for brand lookups: a new organization's logo, and the
 * recipes the paywall shows for its kind of business. Empty turns them off.
 */
const CONTEXT_DEV_API_KEY = env("EMITKIT_CONTEXT_DEV_API_KEY", "");

const base64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64url");

export const DB = Cloudflare.D1.Database("DB", {
  migrations: "./migrations",
  name: `${NAME}-db`,
});
export const EventsDataset = Cloudflare.AnalyticsEngine.Dataset(
  "EventsDataset",
  { dataset: DATASET }
);
export const EventsQueue = Cloudflare.Queues.Queue("EventsQueue", {
  name: `${NAME}-events`,
});
export const Email = Cloudflare.Email.SendEmail("EMAIL", {
  allowedSenderAddresses: [EMAIL_FROM],
});

export default Alchemy.Stack(
  "EmitKit",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    const zone = yield* Cloudflare.Zone.findZoneByName({
      accountId,
      name: DOMAIN,
    }).pipe(Effect.orDie);
    if (!zone) {
      return yield* Effect.die(
        `Zone ${DOMAIN} was not found in account ${accountId}`
      );
    }

    yield* Cloudflare.Email.SendingSubdomain("MailDomain", {
      name: MAIL_DOMAIN,
      zoneId: zone.id,
    });

    const authSecret = yield* Alchemy.Random("BetterAuthSecret", { bytes: 32 });
    // A P-256 private scalar; the browser-facing public key is derived from it.
    const vapidSeed = yield* Alchemy.Random("VapidPrivateKey", { bytes: 32 });
    const vapidPrivateKey = vapidSeed.text.pipe(
      Output.map((seed: Redacted.Redacted<string>) =>
        Redacted.make(base64Url(Buffer.from(Redacted.value(seed), "hex")))
      )
    );
    const vapidPublicKey = vapidSeed.text.pipe(
      Output.map((seed: Redacted.Redacted<string>) => {
        const ecdh = createECDH("prime256v1");
        ecdh.setPrivateKey(Buffer.from(Redacted.value(seed), "hex"));
        return base64Url(ecdh.getPublicKey());
      })
    );

    // Read-only token for the Analytics Engine SQL API (the Worker's event feed).
    const analyticsToken = ANALYTICS_ENGINE
      ? yield* Cloudflare.ApiToken.AccountApiToken("AnalyticsReadToken", {
          accountId,
          name: `${NAME}-analytics-read`,
          policies: [
            {
              effect: "allow",
              permissionGroups: ["Account Analytics Read"],
              resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
            },
          ],
        })
      : null;

    const queue = yield* EventsQueue;
    const worker = yield* Cloudflare.Worker("Worker", {
      assets: {
        directory: "./dist/client",
        htmlHandling: "none",
        notFoundHandling: "none",
        runWorkerFirst: ["/*", "!/assets/*"],
      },
      bundle: false,
      compatibility: {
        date: "2026-09-20",
        // Callbacks go to URLs senders choose: without this, a request to
        // another host on this zone reaches its origin directly, past the
        // zone's security settings.
        flags: ["nodejs_compat", "global_fetch_strictly_public"],
      },
      crons: ["23 * * * *"],
      domain: SITE_HOST
        ? {
            aliases: [APP_HOST, API_HOST, ...(DOCS_HOST ? [DOCS_HOST] : [])],
            name: SITE_HOST,
            redirects: REDIRECT_HOSTS,
            zoneId: zone.id,
          }
        : { aliases: [API_HOST], name: APP_HOST, zoneId: zone.id },
      env: {
        AE_DATASET: DATASET,
        ...(AI ? { AI: Cloudflare.Workers.AI() } : {}),
        ALLOW_SIGNUP,
        API_URL: `https://${API_HOST}`,
        APP_URL: `https://${APP_HOST}`,
        ...billingSecrets,
        ...(analyticsToken ? { CF_ANALYTICS_TOKEN: analyticsToken.value } : {}),
        BETTER_AUTH_SECRET: authSecret.text,
        CF_ACCOUNT_ID: accountId,
        ...(CONTEXT_DEV_API_KEY
          ? { CONTEXT_DEV_API_KEY: Redacted.make(CONTEXT_DEV_API_KEY) }
          : {}),
        DB,
        DOCS_HOST,
        EMAIL: Email,
        EMAIL_FROM,
        EVENT_STORE,
        EVENTS_DATASET: EventsDataset,
        EVENTS_QUEUE: EventsQueue,
        PARSEW_PUBLISHABLE_KEY: PARSEW_KEY,
        ...(SITE_HOST ? { SITE_URL: `https://${SITE_HOST}` } : {}),
        ...telemetrySettings,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_SUBJECT,
      },
      main: "./dist/emitkit/index.js",
      name: NAME,
      observability: { enabled: true },
      workersDev: false,
    });

    yield* Cloudflare.Queues.Consumer("EventsConsumer", {
      queueId: queue.queueId,
      scriptName: worker.workerName,
      settings: { batchSize: 25, maxRetries: 3, maxWaitTimeMs: 1000 },
    });

    return {
      api: `https://${API_HOST}`,
      app: `https://${APP_HOST}`,
      ...(SITE_HOST ? { site: `https://${SITE_HOST}` } : {}),
      worker: NAME,
    };
  })
);
