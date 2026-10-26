# Notes: compact dashboard feed (local run)

This report is from the change that replaces the events console with one compact feed. That change adds:

- inline event details;
- the pulse (events and revenue over 24H / 7D / 30D);
- event value extraction (`amount` + `currency`);
- Parsew brand icons.

**Target:** local `pnpm dev` with `EVENT_STORE=d1`.

## What ran

`02-public-api` and `04-dashboard` are the scenarios this change touches. They ran together, and all 18 tests passed:

- `04` › events feed: a live event arrives. The pulse shows €240 revenue from `{"amount": 240, "currency": "eur"}`, and `amount` without `currency` is not counted. Search works. Unfolding a row shows typed metadata ("Invoice URL", "Last 4", `durationMs` shown as "2s"), and the card scrolls fully into view. The channel link in the details filters the feed and the chip clears it. Delete from the details works.
- `02` › the dashboard reads `events/pulse`: 24 hourly points, and `value` is `null` when no event carries a currency.

## Not covered here

- **The Analytics Engine path of `events.pulse`** (production, `EVENT_STORE=analytics-engine`) has not run. It only uses constructs the existing `scan` query already uses (`SUM(IF(…))`, `_sample_interval`, `GROUP BY` a blob). Check it with `E2E_TARGET=production` after deploying.
- **Parsew icons with a real key.** With a dummy `pk_` key, the browser requested `https://logo.parsew.com/<domain>?…&fallback=404` for:
  - a user's company domain;
  - link domains in metadata.

  Every failed image fell back to the initials or dot, so no broken images were left. With no key there are no requests at all.
- **Other scenarios, run locally, on this branch and on `main` alike:**
  - `03-auth` › sign back in and `06-account-pwa` › password change fail at the sign-in step. Better Auth's IP rate limit applies, and every local request comes from the same address.
  - `01-routing` › marketing pages fails because only `/` renders in dev.
  - `05` needs a real push service and `07` needs the built docs.
  - None of these touch the dashboard.

## Brand refresh (same working tree)

This report's run was made against the production bundle (`pnpm build`, then `wrangler dev` on port 5173 so the hostnames match). It covers `01-routing`, `02-public-api`, `04-dashboard` and `07-docs`: 22 passed and 7 skipped. The docs scenarios run only against production, and the `www` redirect check is production-only.

Checked by hand against the same bundle:

- **Every icon URL returns 200 on both hosts, at the right size.** That covers `favicon.ico/.svg/-96x96`, `apple-touch-icon` (180, opaque), the manifest `any` and `maskable` icons (192 and 512) and the notification `badge-96x96`. Both manifests list 5 icons.
- **Social card and fonts:** `og:image` is `og-image.jpg?v=2` (1200×630), and the site preloads `Geist-*.woff2`.
- **Docs wordmark** renders at 103×28, above the kit's 96px minimum. The dark variant is swapped in by Blume.
- **Verification email** shows the hosted `email-wordmark.png` and an Emit Blue button.
