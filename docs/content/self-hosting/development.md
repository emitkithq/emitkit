---
title: "Development"
description: "Local setup, checks, and where to add procedures, tables and bindings."
---

## Prerequisites

- Node 24+, pnpm 12. Nothing else: every dependency is public, so a plain clone installs and builds.

## First run

Conductor (`conductor.json`) and Paseo (`paseo.json`) worktrees run `scripts/workspace-setup.sh`: it links `.dev.vars` and `.env.local` from the main checkout, installs dependencies and migrates local D1. Their dev scripts pass the port the tool assigns as `PORT` (see below), so worktrees run side by side. Otherwise:

```bash
pnpm install
pnpm exec wrangler d1 migrations apply DB --local    # local D1 in .wrangler/state
node -e 'const {generateKeyPairSync}=require("crypto");const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});const p=publicKey.export({format:"jwk"}),s=privateKey.export({format:"jwk"});const b=x=>Buffer.from(x,"base64url");console.log("VAPID_PUBLIC_KEY="+Buffer.concat([Buffer.from([4]),b(p.x),b(p.y)]).toString("base64url"));console.log("VAPID_PRIVATE_KEY="+s.d)'
```

Put `VAPID_PRIVATE_KEY` and a random `BETTER_AUTH_SECRET` (32+ characters) in `.dev.vars`. Put the printed `VAPID_PUBLIC_KEY` in `wrangler.jsonc`.

```bash
pnpm dev
```

To fill the local database, run `pnpm db:seed:local` (`wrangler d1 execute DB --local --file=seed/local.sql`, the D1 way to run SQL against local state). It gives `dev@example.com` an "EmitKit" workspace at `/emitkit`, with the app icon as its logo. The workspace runs four real products under their real URLs: Cal.com, Dub, Plausible and Excalidraw, with 12 channels between them. Its customers are made-up people at real companies (`maya@linear.app`, `kenji@stripe.com`, …). It has 1,440 events over 60 days, growing gently with a daily rhythm so every dashboard range has a previous period to compare against, and busiest in the last half hour. Payments, errors and traffic spikes are marked as pushed. Their metadata carries real links: GitHub commits and pull requests, `dub.sh` short links, referrers, Stripe invoices. It also has USD and EUR revenue with refunds, and the API key `emitkit_localdevseed`. Brand icons for those domains appear once `PARSEW_PUBLISHABLE_KEY` is set in `.dev.vars`. That key exists only in local D1. Running the seed again refreshes the seeded events to the current time and leaves everything else alone. The file sits outside `migrations/`, so deploys never apply it.

| URL | Surface |
| --- | --- |
| http://localhost:5173 | marketing site (only `/` renders in dev; other pages are prerendered at build) |
| http://app.localhost:5173 | PWA, `/api/auth/*`, `/rpc/*` |
| http://api.localhost:5173 | public API, `/openapi.json`, `/mcp` |

`EMITKIT_SITE=off pnpm dev` serves no marketing site, like a deployment without `EMITKIT_SITE_HOST`: `http://localhost:5173` then shows the app too.

`PORT=5180 pnpm dev` serves the same hosts on another port; `vite.config.ts` points the Worker's `SITE_URL`, `APP_URL` and `API_URL` at it, and the local E2E target follows `PORT` too. Paseo's own proxy URL (`$PASEO_URL`) is a single hostname, so use the `*.localhost:<port>` URLs above instead.

To skip signing in, click **Continue in local dev** on the sign-in page. It signs you in as `dev@example.com` ("Local Dev") and creates that user the first time. It lands on the seeded Acme workspace, or on getting-started if you haven't seeded. The button and its endpoint (`POST /api/auth/dev/sign-in`) only exist under `pnpm dev`. Builds, including the production-like run below, answer 404.

`*.localhost` resolves to 127.0.0.1 in browsers and curl. Local email is captured by the Workers email simulator and logged by the dev server. Local events use the D1 store (`EVENT_STORE=d1`).

## Checks

```bash
pnpm check        # Ultracite: oxlint (+ Effect plugin) and oxfmt
pnpm fix          # autofix
pnpm typecheck    # tsc for worker, web and node projects
pnpm build        # vite build (worker + PWA + site) + marketing prerender + docs (Blume) bundled at /docs
pnpm verify       # all three
```

All three must pass before a commit. The repository has no unit tests: behaviour is verified end to end (see `e2e/README.md`).

## A production-like local run

`vite dev` runs the Worker through Vite's module runner. To run the exact production bundle in workerd:

```bash
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state
# app: http://app.localhost:8788 (send Origin: http://app.localhost:5173 for auth calls)
```

## Docs

`docs` is a separate Blume (Astro) site in its own workspace package. It is served at `/docs` on the site host.

```bash
pnpm docs:dev     # Blume dev server with live reload (the URL is printed; pages live under /docs)
pnpm docs:build   # static build to docs/dist; `pnpm build` runs it and copies it into the Worker's assets
```

Pages are Markdown or MDX under `docs/content` (navigation order in each folder's `meta.ts`); `docs/content/self-hosting` holds this section. Changelog entries use `type: changelog` in `content/changelog/`. Write links as if the docs were mounted at the root (`/getting-started`); Blume adds `/docs`. The API reference is generated from `openapi/openapi.json`. oxfmt skips the MDX, because it breaks Blume's `:::` blocks and code groups.

## Adding things

- **A dashboard procedure**: add it to `src/shared/rpc/contract.ts` (Effect Schema input/output), implement it in the service under `src/server/…`, and wire it in `src/worker/rpc.ts`.
- **A table or column**: write `migrations/000N_name.sql`. For Better Auth plugin changes, run `pnpm exec tsx --tsconfig tsconfig.node.json scripts/generate-auth-schema.ts` and copy the new DDL into a migration. Alchemy applies pending migrations on deploy. Locally, run `pnpm db:migrate:local`.
- **A binding**: declare it in both `alchemy.run.ts` and `wrangler.jsonc`, type it in `src/server/platform/env.ts`, and wrap it in a platform service.

## Patched dependencies

`patches/@heroui__react@3.2.6.patch` (applied by pnpm through `patchedDependencies` in `pnpm-workspace.yaml`) fixes HeroUI's `ErrorMessage` inside dialogs. From react-aria-components 1.21, every `Dialog` provides a `TextContext` with only a `description` slot. HeroUI's standalone `ErrorMessage` renders `Text slot="errorMessage"`, which then throws `Invalid slot "errorMessage"`. That crashed Settings whenever a Better Auth UI dialog showed a server error, such as a wrong password in "Delete account". The patch renders a plain `role="alert"` element in that case. `06-account-pwa.spec.ts` covers it. Drop the patch once a HeroUI release fixes it; pnpm fails the install if the patch no longer applies after a version bump.

## Brand assets

The EmitKit brand kit (SVG masters, Geist fonts, colour and usage rules) is the source for every brand file. The web files are generated from its SVGs and committed:

| Files | Artwork |
| --- | --- |
| `web/public/{app,www}/favicon.svg`, `favicon.ico` (16/32/48), `favicon-96x96.png`, `web-app-manifest-{192,512}` | standard app icon, rounded |
| `apple-touch-icon.png`, `web-app-manifest-maskable-{192,512}` | standard app icon, square (iOS and maskable crops round it themselves) |
| `web/public/app/badge-96x96.png` | white mark on transparent (Android notification badges use alpha only) |
| `web/public/www/og-image.jpg` | the kit's `kit/svg/og-image.svg` with its tagline replaced by "Stay in the loop with your product.", rendered at 1200 × 630 with Geist; bump `?v=` in `web/www/head.ts` when it changes |
| `web/public/app/email-wordmark.png` | midnight wordmark for transactional emails, served from the app host every deployment has (emails can't show SVG). The copy in `web/public/www` keeps the logo in emails sent before it moved |
| `web/public/www/logo-emitkit.png` | midnight wordmark (structured data) |
| `docs/public/*`, `docs/fonts/*` | the same icons, both wordmarks, Geist |
| `web/public/www/images/{cloud,island,peak}-{1200,2400}.{avif,webp}` | the kit's photography (`assets/img-*.jpg`), for the homepage |
| `web/public/www/images/halo-{1200,2400}.{avif,webp}` | the hero photo, the kit's `uploads/serenox/serenox-Image 30.png` (encoded with `sips`, `cwebp -q 82`, `avifenc -q 60 -s 4`) |
| `web/public/www/patterns/*.svg` | the kit's halftone ripple and ping, generated by `scripts/generate-patterns.ts` |
| `web/public/www/images/dashboard-{loop,wins,pulse,errors}-{800,1600}.{avif,webp}` | screenshots of the seeded dashboard, captured by `scripts/capture-dashboard-shot.ts`; not on the homepage, whose hero now runs the live dashboard demo |

The four dashboard screenshots are the seeded EmitKit workspace: today's feed, a week of Cal.com #payments with a purchase opened, 30 days across every project, and Excalidraw's #errors with a failure opened. To retake them after a dashboard change, re-seed (events are placed relative to now), start `pnpm dev`, then run `pnpm exec tsx --tsconfig tsconfig.node.json scripts/capture-dashboard-shot.ts`. The script needs macOS `sips`, `cwebp` and `avifenc`.

In code, use `BrandMark`, `Wordmark` and `AppIcon` from `@ui/brand-mark`. They carry the kit's rules: blue or white artwork only, never the name typed next to the mark, and a wordmark at least 96px wide. Geist / Geist Mono are self-hosted in `web/ui/fonts`.

`web/ui/styles.css` maps the kit's palette onto HeroUI's tokens, so HeroUI components follow it: Mist background, Paper surfaces, Ink text, Graphite muted text, Emit Blue accent with Deep Blue hover. In dark mode the background is Midnight and Signal is the highlight and focus colour. A `class="dark"` subtree sets a Midnight section on a light page. For brand fields that must not follow the theme, the palette is also available as fixed colours (`bg-emit-blue`, `text-signal`, `bg-midnight`). The kit's type roles are `text-display`, `text-heading`, `text-lead` and `text-copy`.
