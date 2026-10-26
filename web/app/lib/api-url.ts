const APP_PREFIX = "app.";

/**
 * The public API origin for copy-paste snippets. The API lives on the sibling
 * `api.` host of whatever host serves the dashboard (`app.emitkit.com` →
 * `api.emitkit.com`, `app.localhost:5173` → `api.localhost:5173`).
 */
export const publicApiOrigin = (
  location: Pick<Location, "hostname" | "port" | "protocol"> = window.location
): string => {
  // The Worker injects the configured API origin into every page it serves.
  const configured = document
    .querySelector<HTMLMetaElement>('meta[name="emitkit:api-url"]')
    ?.content.trim();
  if (configured) {
    return configured.replace(/\/+$/u, "");
  }
  const host = location.hostname.startsWith(APP_PREFIX)
    ? `api.${location.hostname.slice(APP_PREFIX.length)}`
    : `api.${location.hostname}`;
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${host}${port}`;
};

/** The docs, served under /docs on the site host the Worker injects (`emitkit:site-url`). */
export const docsUrl = (): string => {
  const site = document
    .querySelector<HTMLMetaElement>('meta[name="emitkit:site-url"]')
    ?.content.trim()
    .replace(/\/+$/u, "");
  return `${site || "https://emitkit.com"}/docs`;
};

const PLACEHOLDER_KEY = "emitkit_xxx";

/** The `curl` request that sends one event, spelled out in full to be run as-is. */
export const eventCurl = ({
  apiKey,
  channelName = "payments",
  title = "New subscription",
}: {
  apiKey?: string | undefined;
  channelName?: string | undefined;
  title?: string | undefined;
} = {}): string => {
  const body = JSON.stringify({ channelName, icon: "💰", notify: true, title });
  return [
    `curl -X POST ${publicApiOrigin()}/v1/events \\`,
    `  -H "Authorization: Bearer ${apiKey ?? PLACEHOLDER_KEY}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${body.replaceAll("'", "'\\''")}'`,
  ].join("\n");
};

const DEFAULT_API_ORIGIN = "https://api.emitkit.com";

/** The same event through the `@emitkit/js` SDK, as the SDK docs show it. */
export const eventSdkSnippet = ({
  channelName = "payments",
  title = "New subscription",
}: {
  channelName?: string | undefined;
  title?: string | undefined;
} = {}): string => {
  const origin = publicApiOrigin();
  // The SDK targets api.emitkit.com; other deployments pass their API origin.
  const options =
    origin === DEFAULT_API_ORIGIN ? "" : `, {\n  baseUrl: "${origin}",\n}`;
  return [
    'import { EmitKit } from "@emitkit/js";',
    "",
    `const emitkit = new EmitKit(process.env.EMITKIT_API_KEY!${options});`,
    "",
    "await emitkit.events.create({",
    `  channelName: ${JSON.stringify(channelName)},`,
    `  title: ${JSON.stringify(title)},`,
    '  icon: "💰",',
    '  metadata: { amount: 49, currency: "EUR" },',
    "});",
  ].join("\n");
};

/** The SDK guide in the docs. */
export const sdkDocsUrl = (): string => `${docsUrl()}/sdk`;
