---
title: "Configuration"
description: "Every deploy setting, Worker binding and secret, and the deploy token permissions."
---

## Deploy-time settings (`alchemy.run.ts`)

Read from the environment of `alchemy deploy`, usually `.env.local` (gitignored) through `--env-file`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | — (required) | Deploy token, see permissions below |
| `CLOUDFLARE_ACCOUNT_ID` | — (required) | Target account |
| `EMITKIT_DOMAIN` | — (required) | Zone that serves every hostname |
| `EMITKIT_APP_HOST` | `app.$EMITKIT_DOMAIN` | PWA + auth + RPC hostname |
| `EMITKIT_API_HOST` | `api.$EMITKIT_DOMAIN` | Public API hostname |
| `EMITKIT_SITE_HOST` | empty | Hostname of the marketing site and docs (emitkit.com sets its apex). Empty serves no site: every host of the Worker shows the app, and docs links point at emitkit.com. When the app host is a subdomain of the site host, the site's header shows **Dashboard** to signed-in visitors; otherwise it always shows Sign in |
| `EMITKIT_REDIRECT_HOSTS` | `www.$EMITKIT_DOMAIN` | Only with a site host: comma-separated hosts that 301 to the site; empty for none |
| `EMITKIT_DOCS_HOST` | `docs.$EMITKIT_DOMAIN` | Only with a site host: old docs hostname, attached to the Worker and 301'd to `<site>/docs/<same path>`; empty for none |
| `EMITKIT_MAIL_DOMAIN` | `mail.$EMITKIT_DOMAIN` | Email Sending subdomain (DKIM/SPF records are created automatically) |
| `EMITKIT_EMAIL_FROM` | `noreply@$EMITKIT_MAIL_DOMAIN` | Sender of auth and invitation email |
| `EMITKIT_WORKER_NAME` | `emitkit` | Worker, D1 (`<name>-db`) and queue (`<name>-events`) names |
| `EMITKIT_AE_DATASET` | `emitkit_events` | Analytics Engine dataset |
| `EMITKIT_ALLOW_SIGNUP` | `true` | `false` disables self-service sign-up (invitations still work) |
| `EMITKIT_EVENT_STORE` | `analytics-engine` | `d1` keeps events in D1 for 90 days instead, and mints no analytics token |
| `EMITKIT_AI` | `true` | `false` removes the Workers AI binding; emoji suggestions fall back to keyword matching |
| `EMITKIT_VAPID_SUBJECT` | `mailto:hi@$EMITKIT_DOMAIN` | Contact for push services |
| `EMITKIT_AUTUMN_SECRET_KEY` | empty | Hosted billing through [Autumn](https://useautumn.com) (`am_sk_…`). Leave it empty when self-hosting: nothing is gated, every organization has everything, and Settings → Billing says the server has no billing. |
| `EMITKIT_AUTUMN_WEBHOOK_SECRET` | empty | Signing secret (`whsec_…`) of the Autumn webhook endpoint `https://<app host>/api/billing/webhook`. Without it billing still works, refreshing each organization's plan at most every 15 minutes, but no billing push notices are sent. |
| `EMITKIT_TELEMETRY_EMITKIT_API_KEY` | empty | Product telemetry for whoever runs the deployment: an EmitKit API key (`emitkit_…`, for a project on emitkit.com) that gets a push for every sign-up, trial, payment, milestone and deletion. Empty sends nothing. See [Request flows](/self-hosting/architecture#request-flows). |
| `EMITKIT_TELEMETRY_OPENPANEL_CLIENT_ID`, `EMITKIT_TELEMETRY_OPENPANEL_CLIENT_SECRET` | empty | An [OpenPanel](https://openpanel.dev) project's client id and secret, which receives every telemetry event plus user profiles. Set both or neither. The client id is public: pages carry it to report page views from the browser, so add the site and app origins (e.g. `emitkit.com`, `app.emitkit.com`) to that client's allowed domains in OpenPanel, or it refuses them. The secret stays in the Worker. |
| `EMITKIT_TELEMETRY_OPENPANEL_API_URL` | empty | A self-hosted OpenPanel's API URL (e.g. `https://openpanel.example.com/api`). Empty sends to OpenPanel Cloud. |
| `EMITKIT_CONTEXT_DEV_API_KEY` | empty | [Context.dev](https://www.context.dev) secret key (`ctxt_secret_…`) for brand lookups on the hosted paywall: the brand behind a new owner's work domain (or the website they enter) names the organization, gives it an avatar and picks the example notifications shown before the trial. Only matters with billing on. Empty shows the general examples and a picker. Locally, set `CONTEXT_DEV_API_KEY` in `.dev.vars`. |
| `EMITKIT_PARSEW_KEY` | empty | Publishable Parsew key (`pk_…`) for brand icons (projects by their website, users by their email domain, links). It is public: the browser puts it in image URLs, so restrict it to the app origin in the Parsew dashboard. Empty shows initials and dots instead. Locally, set `PARSEW_PUBLISHABLE_KEY` in `.dev.vars`. |

### Build-time settings (`pnpm build`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCS_SITE_URL` | `https://emitkit.com` | Origin used for the docs' canonical URLs, sitemap and Open Graph images (`docs/blume.config.ts`). Only matters with `EMITKIT_SITE_HOST`: set it to that origin. The docs are served at `/docs` on the site host. |
| `DOCS_APP_URL` | `https://app.emitkit.com` | Target of the docs' "Open dashboard" link. Only matters with `EMITKIT_SITE_HOST`. |

### Deploy token permissions

Create a custom account API token scoped to the account and the zone:

- Account: Workers Scripts Edit, D1 Edit, Queues Edit, Workers AI Read, Email Sending Edit, Account API Tokens Edit, Account Settings Read, Secrets Store Edit.
- Zone: Zone Read, DNS Edit, Workers Routes Edit, SSL and Certificates Edit, Single Redirect Edit.

"Account API Tokens Edit" lets the stack mint the Worker's read-only Analytics Engine token (`<name>-analytics-read`); leave it out with `EMITKIT_EVENT_STORE=d1`. "Workers AI Read" can go with `EMITKIT_AI=false`, and "Single Redirect Edit" is only used for the redirect hosts of a site. "Secrets Store Edit" lets Alchemy reach its state store, whose bearer token lives in the account Secrets Store.

## Worker variables and secrets

The stack sets these on the Worker. You don't set them yourself.

| Binding / variable | Kind | Source |
| --- | --- | --- |
| `DB` | D1 | `Cloudflare.D1.Database`, migrations from `./migrations` |
| `EVENTS_DATASET` | Analytics Engine | `Cloudflare.AnalyticsEngine.Dataset` |
| `EVENTS_QUEUE` | Queue producer (+ consumer) | `Cloudflare.Queues.Queue` |
| `EMAIL` | `send_email` | restricted to `EMITKIT_EMAIL_FROM` |
| `AI` | Workers AI | emoji suggestions; absent with `EMITKIT_AI=false` |
| `ASSETS` | static assets | `./dist/client` |
| `APP_URL`, `API_URL` | text | from the hosts above |
| `SITE_URL` | text | from `EMITKIT_SITE_HOST`; unset without a site |
| `EVENT_STORE` | text | `EMITKIT_EVENT_STORE` |
| `ALLOW_SIGNUP`, `EMAIL_FROM`, `VAPID_SUBJECT`, `AE_DATASET`, `CF_ACCOUNT_ID` | text | from settings |
| `VAPID_PUBLIC_KEY` | text | derived from the generated VAPID private key |
| `BETTER_AUTH_SECRET` | secret | `Alchemy.Random` (32 bytes), kept in Alchemy state |
| `VAPID_PRIVATE_KEY` | secret | `Alchemy.Random` (P-256 scalar), kept in Alchemy state |
| `CF_ANALYTICS_TOKEN` | secret | account token minted by the stack (Account Analytics Read); only with Analytics Engine |
| `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET` | secret | optional, from the `EMITKIT_AUTUMN_*` settings; only when billing is on |
| `TELEMETRY_EMITKIT_API_KEY`, `TELEMETRY_OPENPANEL_CLIENT_SECRET` | secret | optional, from the `EMITKIT_TELEMETRY_*` settings |
| `TELEMETRY_OPENPANEL_CLIENT_ID`, `TELEMETRY_OPENPANEL_API_URL` | text | optional, from the `EMITKIT_TELEMETRY_OPENPANEL_*` settings |
| `CONTEXT_DEV_API_KEY` | secret | optional, from `EMITKIT_CONTEXT_DEV_API_KEY` |

`BETTER_AUTH_SECRET` also derives the key that seals API keys so owners can reveal them again (`api_key_secret`). If you change it, existing keys keep working but can no longer be revealed; rotate a key to make it revealable again.

The Worker validates its configuration at startup (`src/server/platform/config.ts`). A missing or malformed value fails every request with a logged `ConfigError`.

## Local development (`wrangler.jsonc` + `.dev.vars`)

`wrangler.jsonc` declares the same bindings for `@cloudflare/vite-plugin` with `EVENT_STORE=d1` and `*.localhost:5173` URLs. Local secrets go in the gitignored `.dev.vars`:

```
BETTER_AUTH_SECRET=<at least 32 random characters>
VAPID_PRIVATE_KEY=<base64url P-256 private scalar>
```

`VAPID_PUBLIC_KEY` in `wrangler.jsonc` must be the matching public key. [Development](/self-hosting/development) shows how to generate a pair.

Telemetry stays off locally unless you add its keys to `.dev.vars` (`TELEMETRY_EMITKIT_API_KEY`, `TELEMETRY_OPENPANEL_CLIENT_ID`, `TELEMETRY_OPENPANEL_CLIENT_SECRET`). Use a separate EmitKit project and OpenPanel project for that, not production's. Local dev sign-in (`dev@example.com`) and the E2E accounts are never reported.

To try hosted billing locally, add an Autumn **sandbox** key (`AUTUMN_SECRET_KEY=am_sk_test_…`) to `.dev.vars`, and optionally a made-up `AUTUMN_WEBHOOK_SECRET=whsec_<base64>` for the signed-webhook check in `e2e/scenarios/14-billing.spec.ts`. In a worktree, replace the `.dev.vars` symlink with a copy first, so the key stays out of the main checkout. The plans live in `autumn.config.ts`; `pnpm billing:push` previews changes against the sandbox and `pnpm billing:push --yes` applies them.
