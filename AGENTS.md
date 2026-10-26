# EmitKit v3

EmitKit is an event-tracking and push-notification product. One Cloudflare Worker serves every hostname:

| Hostname | Surface |
| --- | --- |
| `api.emitkit.com` | Public REST API, OpenAPI document, MCP |
| `app.emitkit.com` | Dashboard PWA, Better Auth, dashboard RPC |
| `emitkit.com` | Marketing site, docs at `/docs` (`www.` redirects to apex) |

The marketing site is served only when `EMITKIT_SITE_HOST` is set (self-hosted deployments serve just the app and API). The hosted deploy therefore needs `EMITKIT_DOMAIN=emitkit.com` and `EMITKIT_SITE_HOST=emitkit.com` in `.env.local` and in the Workers Builds variables.

Operator telemetry (trakoo → EmitKit pushes and OpenPanel, see the architecture doc) is off unless its keys are set. The hosted deploy sets `EMITKIT_TELEMETRY_EMITKIT_API_KEY`, `EMITKIT_TELEMETRY_OPENPANEL_CLIENT_ID` and `EMITKIT_TELEMETRY_OPENPANEL_CLIENT_SECRET` in the same two places. New telemetry events go in `src/server/telemetry/events.ts`; a category in `pushChannels` means EmitKit pushes it.

`docs/` is the Blume docs site served at `emitkit.com/docs`; the operator and contributor docs are its Self-hosting section in `docs/content/self-hosting/`. Read `docs/content/self-hosting/architecture.md` before adding modules, routes, bindings or dependencies.

## Pricing

Self-hosting is free (PolyForm Shield). Hosted plans, billed through Autumn + Stripe in USD:

| Plan | Price | Seats |
| --- | --- | --- |
| Solo | $9/mo or $90/yr | 1, +$9/mo (+$90/yr) per extra seat |
| Team | $39/mo or $390/yr | 5, +$9/mo (+$90/yr) per extra seat |
| Solo Lifetime | $79 once, rising every 5 sales: $99, $119, then $149 | 1 |
| Team Lifetime | $499 once | 5 |

- Monthly and yearly plans start with a 14-day, card-required trial. Events are unlimited under fair use (about 250,000 a month per organization).
- A new organization needs a plan from the start: sign-up lands on the paywall, starts the trial through Stripe, then opens the setup guide. Invited members are covered by their organization's plan.
- Change prices in `autumn.config.ts` (`pnpm billing:push`) and `src/shared/billing.ts` together. Billing is off unless `AUTUMN_SECRET_KEY` is set.

## Engineering rules

- The repository is self-hostable from a plain clone: no licensed packages (HeroUI Pro is not used; build on the free `@heroui/react` and local components in `web/ui`), and hosted-only features stay behind settings that default to off.
- Keep the architecture simple. One Worker, one Vite build (plus the Blume docs build in `docs`, bundled into the same Worker), one D1 database. Add a Cloudflare resource or a dependency only when a feature cannot work without it, and record why in `docs/content/self-hosting/architecture.md`.
- Never write unit tests after writing implementation code.
- Strongly prefer E2E tests as the sole testing mechanism. Use them to verify complex features.
- After E2E testing, produce a verifiable, repeatable artifact: runnable scenarios, instructions, and a report with relevant traces and screenshots. Exclude secrets (API keys, session cookies, tokens) from every artifact. Commit only `report.md` and `notes.md`; screenshots, traces and logs stay local (gitignored) and go on the PR when a reviewer needs them.
- If testing a system in isolation is necessary, first write down all the ways it could fail, then write the code.
- Lint, type checks and production builds are required before every commit: `pnpm check` (Ultracite/Oxlint), `pnpm typecheck`, `pnpm build`.

## Code organization

- Strict TypeScript everywhere. Import through path aliases (`@server/*`, `@shared/*`, `@worker/*`, `@app/*`, `@www/*`, `@ui/*`). Never use deep relative imports such as `../../`; a single `./` sibling import is fine.
- Module boundaries:
  - `src/server` holds all backend logic as Effect services. It never imports from `web/`.
  - `src/worker` is the thin adapter layer (fetch/queue/scheduled handlers, hostname routing, HTTP ↔ Effect translation). No business rules here.
  - `src/shared` holds browser-safe contracts and schemas used by both sides.
  - `web/app` (PWA), `web/www` (marketing) and `web/ui` (design system) never import from `src/server` or `src/worker`.
- Backend code uses Effect: typed errors (`Schema.TaggedError`), services and Layers for dependency injection, `Effect.acquireRelease`/Scope for resources, and structured concurrency instead of floating promises.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the guide doesn't cover, search through the source code in `node_modules/effect/src`.

## Secrets

Never print, log or commit secret values. Local secrets live in the gitignored `.env.local`. Production secrets are Worker secrets managed by Alchemy.
