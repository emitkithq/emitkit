/**
 * Where the scenarios run. `E2E_TARGET` picks a preset; `E2E_SITE_URL`,
 * `E2E_APP_URL` and `E2E_API_URL` override single hosts.
 */
export interface Target {
  readonly name: string;
  readonly site: string;
  readonly app: string;
  readonly api: string;
  /** Origin Better Auth trusts (differs from `app` only for the port-forwarded local bundle). */
  readonly origin: string;
  /** Mailbox pattern for test users; `{id}` is replaced per run. */
  readonly email: string;
  /**
   * False for a deployment without a marketing site (`E2E_NO_SITE=1`; locally
   * `EMITKIT_SITE=off pnpm dev`): `site` then only names another host.
   */
  readonly hasSite: boolean;
}

/** `pnpm dev`'s port: `PORT` when a worktree tool assigned one (vite.config.ts). */
const devPort = process.env.PORT || "5173";

/**
 * Deployed targets send real mail (verification, invitations), so their
 * mailbox comes from `E2E_EMAIL`: an address you own with plus-addressing,
 * so nothing bounces.
 */
const presets: Record<
  string,
  Omit<Target, "email" | "hasSite" | "name"> & { readonly email?: string }
> = {
  local: {
    api: `http://api.localhost:${devPort}`,
    app: `http://app.localhost:${devPort}`,
    email: "e2e+{id}@example.com",
    origin: `http://app.localhost:${devPort}`,
    site: `http://localhost:${devPort}`,
  },
  production: {
    api: "https://api.emitkit.com",
    app: "https://app.emitkit.com",
    origin: "https://app.emitkit.com",
    site: "https://emitkit.com",
  },
  staging: {
    api: "https://staging-api.emitkit.com",
    app: "https://staging-app.emitkit.com",
    origin: "https://staging-app.emitkit.com",
    site: "https://staging.emitkit.com",
  },
};

const name = process.env.E2E_TARGET ?? "local";
const preset = presets[name];
if (!preset) {
  throw new Error(
    `Unknown E2E_TARGET "${name}" (use ${Object.keys(presets).join(", ")})`
  );
}

const email = process.env.E2E_EMAIL ?? preset.email;
if (!email) {
  throw new Error(
    `E2E_TARGET=${name} needs E2E_EMAIL, e.g. you+emitkit-e2e-{id}@your-domain.com`
  );
}

export const target: Target = {
  api: process.env.E2E_API_URL ?? preset.api,
  app: process.env.E2E_APP_URL ?? preset.app,
  email,
  hasSite: process.env.E2E_NO_SITE !== "1",
  name,
  origin: process.env.E2E_ORIGIN ?? preset.origin,
  site: process.env.E2E_SITE_URL ?? preset.site,
};

export const runId = process.env.E2E_RUN_ID ?? `${Date.now().toString(36)}`;
export const testEmail = (label: string) =>
  target.email.replace("{id}", `${runId}-${label}`);
export const TEST_PASSWORD = "e2e-Correct-Horse-9";
