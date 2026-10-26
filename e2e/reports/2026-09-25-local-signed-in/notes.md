# Notes: signed-in visitors (local production bundle)

This report comes from the change that does two things:

- Signed-in visitors are sent on from sign-in, sign-up, magic-link and forgot-password.
- The marketing header shows **Dashboard** instead of **Sign in** and **Get started** to them from the first paint.

`13-signed-in.spec.ts` is new, and the top of the file lists the ways this can break. The run used the **built** bundle. `wrangler dev` served the app on `app.emitkit.localhost` and the site on `emitkit.localhost`, both on one port. Chrome accepts `Domain=emitkit.localhost`, so the real cross-host cookie flow ran locally. It rejects bare `Domain=localhost`, which `pnpm dev` would need. The working tree sat on top of `3a1987a` and was not committed yet, which is why the report shows that commit.

## Reproduce

The generated line in `report.md` (`E2E_TARGET=local-signed-in pnpm e2e`) does not work, because `local-signed-in` only names this report. Run these instead:

```bash
pnpm db:migrate:local
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state \
  --var APP_URL:http://app.emitkit.localhost:8788 --var SITE_URL:http://emitkit.localhost:8788 \
  --var API_URL:http://api.emitkit.localhost:8788
E2E_SITE_URL=http://emitkit.localhost:8788 E2E_APP_URL=http://app.emitkit.localhost:8788 \
  E2E_API_URL=http://api.emitkit.localhost:8788 E2E_ORIGIN=http://app.emitkit.localhost:8788 \
  pnpm exec playwright test e2e/scenarios/01-routing.spec.ts e2e/scenarios/03-auth.spec.ts \
  e2e/scenarios/09-homepage.spec.ts e2e/scenarios/13-signed-in.spec.ts
E2E_TARGET=local-signed-in pnpm e2e:report   # names the report directory only
```

Leave `08-dev-sign-in` out of a bundle run: its local half needs `vite dev`.

## What ran

20 passed and 2 were skipped by design: the `www` redirect runs on production only, and "without a shared domain the site keeps Sign in" only runs when the app host isn't under the site host.

- `sign-in`, `sign-up`, `magic-link` and `forgot-password` all land a signed-in visitor on their organization's events page.
- `redirectTo=/<org>/channels` is honoured. `https://evil.example/…`, `//evil.example/…` and `/auth/sign-in` fall back to `/`.
- The redirect replaces the history entry, so Back goes to the page before, not to sign-in.
- `?reauthenticate=true` still shows the password form.
- With `get-session` aborted, sign-in still shows the form.
- The hint cookie follows the session:
  - Sign-in sets `emitkit_signed_in=1` with `Domain=emitkit.localhost`, `Path=/` and `SameSite=Lax`. Its `Max-Age` equals the session cookie's. It is not HttpOnly, and `Secure` is set only on https.
  - `get-session` with only the session cookie adds the hint, with `Expires`. With both cookies it adds nothing. With only the hint it clears it.
  - Sign-out clears the session cookie and the hint together.
- The site header, signed in:
  - First paint: the site's script was blocked, and the test asserts at least one request was aborted. Dashboard shows, and Sign in and Get started are hidden (screenshot `first-paint-signed-in-header`).
  - After hydration the header looks the same (`hydrated-signed-in-header`). No layout shift was recorded inside the header. Dashboard links to `<app>/` and lands in the organization.
  - A signed-out browser sees Sign in and Get started.
- After signing out through `/auth/sign-out`, the site shows Sign in again. This uses the browser's real cookie, not an injected one.
- 01, 03 and 09 pass unchanged on the bundle. 09 confirms the inline `<head>` script and style survive the prerender.

Also run in this change but not recorded in this report:

- The full suite against `pnpm dev` (56 passed, 16 skipped by design, 0 failed). That run came before the scenario gained its host-layout modes. `13` alone was then re-run against `pnpm dev`: 6 passed, 3 skipped.
- `13` against a bundle whose app host is not under its site host (`site-app.localhost` beside `site.localhost`, the staging layout): 5 passed, 3 skipped. Sign-in sends no hint, the site keeps Sign in, and the auth-page redirects still work.

## Host layouts

The hint only exists when the app host is a subdomain of the site host. Production has that layout (`app.emitkit.com` under `emitkit.com`). Staging doesn't (`staging-app.emitkit.com` beside `staging.emitkit.com`), so its site always shows Sign in. Under `pnpm dev` the hint is sent with `Domain=localhost`, and Chrome drops it, so the dev site always shows Sign in too.

## After deploy

Sessions that already exist get the hint the next time the dashboard loads, because `get-session` adds it. Until then, the site shows Sign in to those visitors.
