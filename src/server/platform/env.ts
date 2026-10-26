import type { QueueMessage } from "@shared/queue";

/**
 * Bindings and variables of the single EmitKit Worker. Names must match
 * alchemy.run.ts (production) and wrangler.jsonc (local development).
 */
export interface Env {
  readonly ASSETS: Fetcher;
  readonly DB: D1Database;
  readonly EVENTS_DATASET: AnalyticsEngineDataset;
  readonly EVENTS_QUEUE: Queue<QueueMessage>;
  readonly EMAIL: SendEmail;
  readonly AI?: Ai;

  readonly APP_URL: string;
  readonly API_URL: string;
  /** Marketing site origin; unset when the deployment serves only the app and API. */
  readonly SITE_URL?: string;
  /** Hostname that 301s to `${SITE_URL}/docs/<path>` (the old docs host); empty for none. */
  readonly DOCS_HOST?: string;
  /** `analytics-engine` (production) or `d1` (local development, simple self-hosting). */
  readonly EVENT_STORE: string;
  readonly ALLOW_SIGNUP: string;
  readonly EMAIL_FROM: string;
  readonly VAPID_PUBLIC_KEY: string;
  readonly VAPID_SUBJECT: string;
  /** Publishable Parsew key (`pk_…`) for brand icons in the dashboard; optional. */
  readonly PARSEW_PUBLISHABLE_KEY?: string;
  /** Analytics Engine dataset name, used by the SQL read path. */
  readonly AE_DATASET?: string;
  readonly CF_ACCOUNT_ID?: string;

  readonly BETTER_AUTH_SECRET: string;
  readonly VAPID_PRIVATE_KEY: string;
  /** API token with Account Analytics Read, used to query Analytics Engine. */
  readonly CF_ANALYTICS_TOKEN?: string;
  /** Autumn secret key (`am_sk_…`); unset (self-hosting) turns billing off. */
  readonly AUTUMN_SECRET_KEY?: string;
  /** Signing secret (`whsec_…`) of the Autumn webhook endpoint; optional. */
  readonly AUTUMN_WEBHOOK_SECRET?: string;
  /** EmitKit API key (`emitkit_…`) that receives this deployment's telemetry pushes; optional. */
  readonly TELEMETRY_EMITKIT_API_KEY?: string;
  /** OpenPanel project that receives this deployment's telemetry; optional, both or neither. */
  readonly TELEMETRY_OPENPANEL_CLIENT_ID?: string;
  readonly TELEMETRY_OPENPANEL_CLIENT_SECRET?: string;
  /** A self-hosted OpenPanel's API URL; unset sends to OpenPanel Cloud. */
  readonly TELEMETRY_OPENPANEL_API_URL?: string;
  /** Context.dev key (`ctxt_secret_…`) for brand lookups; optional. */
  readonly CONTEXT_DEV_API_KEY?: string;
}
