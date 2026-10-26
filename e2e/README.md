# End-to-end scenarios

End-to-end scenarios are the only tests in this repository (see AGENTS.md). Each scenario drives the real product: the deployed Worker, or the local dev server, through its public hostnames, the published `@emitkit/js` SDK, MCP and a real Chrome.

## Run

```bash
pnpm exec playwright install chromium    # once; scenarios use installed Google Chrome by default
E2E_TARGET=production pnpm e2e           # or staging | local (pnpm dev must be running)
E2E_TARGET=production pnpm e2e:report    # writes e2e/reports/<date>-<target>/
```

| Variable | Meaning |
| --- | --- |
| `E2E_TARGET` | `local` (default), `staging`, `production` presets in `support/targets.ts` |
| `E2E_SITE_URL` / `E2E_APP_URL` / `E2E_API_URL` / `E2E_ORIGIN` | override single hosts |
| `E2E_EMAIL` | mailbox pattern for test users, `{id}` = run id. Required for `staging` and `production`, which send real mail: use a plus-address you own (`you+emitkit-e2e-{id}@your-domain.com`) so nothing bounces (`+emitkit-e2e-` marks it a test account, see `src/shared/test-accounts.ts`). `local` defaults to `e2e+{id}@example.com` |
| `E2E_BROWSER_CHANNEL` | `chrome` (default, needed for Web Push) or `chromium` |
| `E2E_NO_SITE` | `1`: the target serves no marketing site (`EMITKIT_SITE_HOST` unset; locally `EMITKIT_SITE=off pnpm dev`). `16` runs, the site scenarios skip, and `pnpm e2e:report` writes `<date>-<target>-no-site/` |
| `E2E_DNS` | e.g. `1.1.1.1`: resolve the target hosts through this server (Node + Chrome), for when a local caching resolver still holds pre-cutover records |

Every run signs up fresh users named after the run id. Each scenario deletes its organization and user when it finishes, so no working credentials outlive the run.

## Scenarios

| File | Covers |
| --- | --- |
| `01-routing.spec.ts` | host → surface routing, prerendered marketing pages + 404, SEO files, `www` redirect, PWA shell/manifest/service worker, `/health`, OpenAPI on both paths |
| `02-public-api.spec.ts` | `@emitkit/js` against the API: create, rate-limit headers, request ids, idempotent replay + 409 conflict, identify + aliases, validation errors; raw HTTP 401/400/413 bodies, `X-API-Key`, `/api/v1` alias; identity erasure; dashboard feed sees events at once; MCP initialize/list/call; 429 with `Retry-After` after 100 requests |
| `03-auth.spec.ts` | UI sign-up (lands in a workspace made for the new user, with the setup guide open), sign-out, sign-in, wrong password, password-reset and sign-in code requests |
| `04-dashboard.spec.ts` | the setup guide (auto-created workspace, revealing the starter key into the snippet, curl → live event with confetti, the phone setup with its QR code and install steps), events console (live update, filters, search, metadata, delete; on a 390 px screen a long event stays on screen and reads in full when opened), API keys (create/reveal/rotate/revoke; a rotated or revoked key can't be revealed), the settings modal (opens over the current page, old `/settings?section=` addresses redirect), members (invite, cancel), organization switcher |
| `05-push-pwa.spec.ts` | service worker registration, Web Push subscription from Settings → Notifications, test notification and event-triggered push delivered through the queue |
| `06-account-pwa.spec.ts` | profile rename, password change, organization rename and re-slug, PWA install prompt and new-version notice, deleting an organization (its API keys stop working) and the account (organizations it owned alone go with it) |
| `14-billing.spec.ts` | hosted billing, as the server is configured. Billing off (self-hosted, the `pnpm dev` default): nothing is gated. Billing on (an Autumn sandbox key in `.dev.vars`): a new organization starts on the paywall modal (no invites, events still recorded, Settings still reachable); the Solo trial starts through Stripe's test checkout (card 4242…) and lands in the setup guide; adding a seat shows the price first, then the invite goes through; the webhook rejects unsigned and tampered calls (set `E2E_AUTUMN_WEBHOOK_SECRET` to the server's `AUTUMN_WEBHOOK_SECRET`). Deleting the organization afterwards cancels its sandbox subscription |
| `17-brand.spec.ts` | the paywall's brand and recipes, when billing is on and `CONTEXT_DEV_API_KEY` is set (both in `.dev.vars` locally; otherwise it skips). A work address (`E2E_BRAND_DOMAIN`, default `linear.app`, local only since that mail isn't delivered under `pnpm dev`) is looked up: the organization takes the brand's name and icon in the header (the slug stays) and the paywall shows that kind of business's four example pushes. The owner corrects it with a website (`E2E_BRAND_WEBSITE`, default `shopify.com`; `localhost` is refused) and by picking Fintech. A gmail.com address is never looked up and gets the SaaS set with "What do you build?". Each run spends Context.dev credits (10 per lookup, three lookups) |
| `15-push-preferences.spec.ts` | push preferences per device in a real Chrome profile: one switch turns the device on in every organization, one organization switched off, another narrowed to a channel, an organization created later picks the device up, and an organization you don't belong to is refused |
| `16-no-site.spec.ts` | a deployment without a marketing site (the self-hosting default). Skips unless `E2E_NO_SITE=1`; locally run `EMITKIT_SITE=off pnpm dev`. Every non-API host serves the app (locally also `www.localhost` and `elsewhere.localhost`), no `emitkit:site-url` is announced, `/health` links emitkit.com's docs, the email wordmark comes from the app host, sign-up works and sets no `emitkit_signed_in` hint. The site scenarios (`01` site half, `07`, `09`, `13` site half) skip in this mode |
| `18-telemetry.spec.ts` | operator telemetry, `local` only. Skips unless `E2E_TELEMETRY_PORT` is set and the dev server's `TELEMETRY_OPENPANEL_API_URL` points at `http://127.0.0.1:$E2E_TELEMETRY_PORT`, where the scenario runs a stand-in OpenPanel that records what the Worker sends. Covers the sign-up (with its user agent and a profile), the workspace, the test event (not a first event), the first API event and the 100-event milestone (once), deletion as churn, E2E accounts never reported, and page views from the site, docs and dashboard (anonymous until sign-up, then under the server's profile id, anonymous again after sign-out, private query parameters left out). With billing on and `E2E_AUTUMN_WEBHOOK_SECRET`, signed `billing.updated` webhooks become trial, conversion, failed-payment, cancellation, plan-change, lifetime and ended events (see `reports/2026-09-26-local-telemetry/notes.md`) |
| `19-actions.spec.ts` | events that ask (fields and actions): validation messages with the path and the fix (unknown settings, `requires`, reserved ids, links), the answer and its fields in `createEvent`/`GET`, answering over RPC (first answer wins, values checked against the fields, long answers), cancel (twice is fine, `not_pending`, `not_waiting`), expiry (a real 10 s wait), links-only events, other projects, organizations, deleted channels and projects, idempotent retries, MCP (the `createEvent` schema equals `openapi.json`'s), error codes, and in Chrome the answer page (`requires`, answering, one tap, the Send answer) and the feed (waiting questions, links, the Answer button); callbacks to a local receiver (signed, verified with `standardwebhooks`, retried with the same id, `event.expired` once, where `callbackUrl` may point, `resume` kept from the dashboard) and revealing the signing secret in Settings → API keys |
| `20-reads.spec.ts` | reads and scopes: `GET /v1/me`, `GET /v1/events` (newest first, `before` paging, `channel`/`since` filters, bad filters named, other projects and organizations kept out), `GET /v1/channels`, read-only keys (403 on writes over REST, only read tools over MCP, rotation keeps them read-only), MCP's HTTP 401 for a bad key, `listEvents`' MCP schema equal to the OpenAPI parameters, `userId` in identify, and creating a read-only key in Settings → API keys |
| `21-email-code.spec.ts` | sign-in by emailed code, local only (codes are read from the mail `pnpm dev` writes to `web/.wrangler/tmp/email`): a signed-out deep link signs in by code and lands back on it, asking again resends the same code, the password still works, a new address gets a verified account, and three wrong codes lock the code |
| `22-push-health.spec.ts` | push keeps working on a device where it was on (persistent Chrome profile, real Web Push): turning it on remembers the device, a replaced subscription takes its per-organization choices to the new endpoint when the app opens, a device the server dropped shows "Notifications stopped" and **Turn back on** subscribes afresh, a subscription the browser dropped is renewed without a prompt, switching every organization off isn't reported as stopped, and signing out removes the device's rows while the browser keeps its registration |
| `08-dev-sign-in.spec.ts` | `local`: "Continue in local dev" signs in as `dev@example.com` and leaves `/auth/*` (the dev user is never deleted). Other targets: `POST /api/auth/dev/sign-in` is 404 with no cookie, and the sign-in page has no such button |
| `09-homepage.spec.ts` | the marketing homepage: prerendered HTML (headline, hero `<picture>`, section anchors, FAQPage data, under 160 KB), hydration without errors, every image loads, sign-up links to the announced app host, code tabs and FAQ work, content visible with JavaScript off and at once with reduced motion, no sideways scroll at 390 px. The HTML checks skip under `vite dev`; run them against a build |
| `10-projects.spec.ts` | the projects list (channel count, "No events yet"), create with a long name (the slug lookup used a LIKE pattern D1 rejects over 50 bytes), edit from the row menu, delete with confirmation, the Deleted list and Restore, the empty state |
| `11-channels.spec.ts` | the Channels screen: empty state, create in a chosen project with a suggested icon, edit icon and description (never the name), a channel created by an event, the project filter in the URL, View events, delete with confirmation |
| `12-theme.spec.ts` | System / Light / Dark from the account menu: System follows the OS live, a stored choice beats the opposite OS scheme across reloads and pages, the first paint already has it (app script blocked), the wordmark is white on dark |
| `13-signed-in.spec.ts` | visitors who already have a session: sign-in, sign-up, email-otp and forgot-password send them to `redirectTo` (off-site and `/auth` targets fall back to `/`, Back doesn't return to the form), re-authentication and a failed session check still show the form, sign-out stays on sign-in; the `emitkit_signed_in` hint cookie's `Set-Cookie` on sign-in, `get-session` and sign-out; the site header shows Dashboard from the first paint (site script blocked; builds only, since `vite dev` renders the site on the client) with no layout shift in the header, and Sign in again after sign-out. The site half depends on the host layout: bare `localhost` (`pnpm dev`) can't read the app's cookie, because Chrome rejects `Domain=localhost`, so the cookie is injected there; a layout where the app isn't under the site host (staging) gets no hint and keeps Sign in. For the full flow locally, serve a build on `*.emitkit.localhost` (see `reports/2026-09-25-local-signed-in/notes.md`) |

Email delivery (sign-in codes, password reset, invitations, verification) goes to real mailboxes, and the scenarios cannot read mail (except `21-email-code` under `pnpm dev`). Entering those codes, following those links, the Queue consumer's log line and the hourly cron are checked by hand. Record them in `notes.md` next to `report.md` (see `reports/2026-09-24-production/notes.md`), and write it after `pnpm e2e:report`, which recreates the directory.

## Screen capture

`e2e/capture/screens.spec.ts` is not a scenario: it screenshots every dashboard screen and state (loading, error, empty, long content, dialogs, settings) in light and dark at 1440 and 390 px, for visual review. It needs `pnpm dev` with the seeded database (`pnpm db:migrate:local && pnpm db:seed:local`):

```bash
CAPTURE_OUT=e2e/reports/<run>/after pnpm exec playwright test --config e2e/capture/playwright.config.ts
```

It signs in with "Continue in local dev", signs up one throwaway user for the empty and long-content states, and removes that user, its workspace, its invitation and the dev session at the end. `console-errors.txt` lists console errors and failed requests (query strings stripped).

## Artifacts

`pnpm e2e:report` copies screenshots, traces and HTTP logs next to `report.md`. Only `report.md` and `notes.md` are committed: the rest is gitignored and stays on the machine that ran the scenarios, so the links in a committed report resolve only there. Attach what a reviewer needs to the PR. The copies are redacted first: `emitkit_…` keys, `authorization`, `cookie`, `set-cookie` and `x-api-key` headers, session cookies, tokens, push keys and the test password become `[REDACTED]`. Open a trace with `pnpm exec playwright show-trace e2e/reports/<run>/traces/<file>.zip`.

## Writing a scenario

Before testing a system in isolation, write down how it could fail (AGENTS.md). Otherwise add a `NN-name.spec.ts`. Arrange state over HTTP with `support/api-session.ts`, assert through the UI or public API, record API calls with `support/http-log.ts`, and clean up in `afterAll`.
