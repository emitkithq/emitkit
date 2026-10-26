# Browser telemetry (page views + identify → OpenPanel) — 2026-09-26

Tested the `browser-telemetry` branch as a production build (`pnpm build`) under `wrangler dev`, with OpenPanel pointed at the scenario's local stand-in. No real keys: the client id is `e2e-telemetry` and the secret a placeholder.

## Reproduce

```bash
pnpm build && pnpm db:migrate:local
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state \
  --var APP_URL:http://app.emitkit.localhost:8788 --var SITE_URL:http://emitkit.localhost:8788 \
  --var API_URL:http://api.emitkit.localhost:8788 \
  --var TELEMETRY_OPENPANEL_CLIENT_ID:e2e-telemetry --var TELEMETRY_OPENPANEL_CLIENT_SECRET:x \
  --var TELEMETRY_OPENPANEL_API_URL:http://127.0.0.1:55071
E2E_SITE_URL=http://emitkit.localhost:8788 E2E_APP_URL=http://app.emitkit.localhost:8788 \
  E2E_API_URL=http://api.emitkit.localhost:8788 E2E_ORIGIN=http://app.emitkit.localhost:8788 \
  E2E_TELEMETRY_PORT=55071 pnpm exec playwright test 01-routing 03-auth 09-homepage 13-signed-in 18-telemetry
E2E_TARGET=local pnpm e2e:report
```

## What the run shows

What the stand-in received from pages (each test's `openpanel-requests` attachment):

- **Site** `/?utm_source=e2e&token=private-site#top` → `screen_view` with `__path` `…/?utm_source=e2e`, no profile, no client secret, `origin` the site.
- **Docs** `/docs`, then a click to `/docs/getting-started` (Astro's client router, no reload) → two `screen_view`s.
- **Dashboard** `/auth/reset-password?token=private-token` → `screen_view` for `/auth/reset-password` only. Neither `private-*` value appears in any request.
- **Sign-up in the UI** → the Worker's `identify` + `new_signup` (with the secret) and the page's own `identify` (no secret) carry the **same** `user_…` profile id; the next page view (the new workspace) carries it too.
- **Sign-out from the account menu** (no reload) → the next page view (`/auth/sign-in`) has no profile.
- `/www/ek.js` is on site and docs pages only; the app loads the module itself. Without the OpenPanel client id there is no meta tag and no script, and the app's 2 KB `visits` chunk never imports trakoo or `@openpanel/web`.

## Not covered here

- The dev-server path of the loader (`/ui/visits-page.ts`, served from source under `pnpm dev`).
- Real OpenPanel Cloud: it refuses browser events from origins its client doesn't allow (a silent 401 that trakoo logs to the console), so production needs `emitkit.com` and `app.emitkit.com` on the client's allowed domains.
- Whether OpenPanel joins an anonymous emitkit.com visitor to the same person on app.emitkit.com before sign-up depends on OpenPanel's device ids (derived from IP and user agent), not on this code.

## Flake fixed on the way

The first full run failed the dashboard test: after 03 and 13's sign-ups, Better Auth's sign-up rate limit answered `429`, and the form cleared its password. The test now waits for the sign-up page's view (the route resolved) and retries a `429` after `X-Retry-After`, as `postAuth` does.
