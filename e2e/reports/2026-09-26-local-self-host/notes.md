# Self-hosting without HeroUI Pro or a marketing site — 2026-09-26

Three local runs, each with its own `report.md`, traces, screenshots and HTTP logs:

| Run | Server | Result | Commit |
| --- | --- | --- | --- |
| [`site/`](site/report.md) | `pnpm dev`, site on (emitkit.com's layout) | 63 passed, 27 skipped, 0 failed | `ecd137a` |
| [`no-site/`](no-site/report.md) | `EMITKIT_SITE=off pnpm dev` (the self-hosting default) | 60 passed, 30 skipped, 0 failed | `9dd5ba8` |
| [`build/`](build/report.md) | the production build under `wrangler dev`, site on | 29 passed, 3 skipped, 0 failed | `9dd5ba8` |

`ecd137a` and `9dd5ba8` differ only in `16-no-site.spec.ts`, which skips in the `site` run, and a line of `e2e/README.md`.

## Reproduce

```bash
# site/: every scenario
PORT=5393 pnpm dev
PORT=5393 E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report

# no-site/: every scenario (restart pnpm dev: EMITKIT_SITE is read at startup)
EMITKIT_SITE=off PORT=5393 pnpm dev
PORT=5393 E2E_TARGET=local E2E_NO_SITE=1 pnpm e2e && E2E_TARGET=local E2E_NO_SITE=1 pnpm e2e:report

# build/: the scenarios that need prerendered pages and the bundled docs
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state \
  --var APP_URL:http://app.emitkit.localhost:8788 --var SITE_URL:http://emitkit.localhost:8788 \
  --var API_URL:http://api.emitkit.localhost:8788
E2E_SITE_URL=http://emitkit.localhost:8788 E2E_APP_URL=http://app.emitkit.localhost:8788 \
  E2E_API_URL=http://api.emitkit.localhost:8788 E2E_ORIGIN=http://app.emitkit.localhost:8788 \
  pnpm exec playwright test e2e/scenarios/01-routing.spec.ts e2e/scenarios/03-auth.spec.ts \
  e2e/scenarios/07-docs.spec.ts e2e/scenarios/09-homepage.spec.ts e2e/scenarios/13-signed-in.spec.ts
E2E_TARGET=local pnpm e2e:report
```

`pnpm e2e:report` writes `<date>-local/` (`<date>-local-no-site/` with `E2E_NO_SITE=1`). Each run's directory was moved here afterwards. The reproduce line that `build/report.md` generated can't tell it was a build run; use the commands above.

## What the runs show

- **Site on:**
  - `site/` runs every scenario. It skips only these:
    - what needs a build: the `01` and `09` prerender checks, `07`, and the `13` first paint;
    - what needs a deployment or production: the `01` `www` test, the deployed half of `08`, and the `13` shared-domain cases;
    - real push delivery (`05`) and the PWA install prompt (`06`);
    - billing on (`14`);
    - all of `16`.
  - `build/` covers what `site/` skips there:
    - the prerendered pages and the 404;
    - the docs under `/docs`, the first local run of `07`;
    - the homepage;
    - the cross-host `emitkit_signed_in` flow on `*.emitkit.localhost`.
  - `www.` still redirects to the site: `curl http://www.emitkit.localhost:8788/privacy?x=1` gives `301` to `http://emitkit.localhost:8788/privacy?x=1`. `01`'s `www` test runs on production only.
- **No site:**
  - `16-no-site` checks four things:
    - `localhost`, `www.localhost` and `elsewhere.localhost` all serve the app;
    - no `emitkit:site-url` is announced;
    - `/health` links `https://emitkit.com/docs`;
    - the wordmark is served from the app host, and sign-up sets no hint.
  - The rest of the suite passes around it.
  - The site scenarios skip themselves under `E2E_NO_SITE=1`: `01` site half, `07`, `09`, and `13` site half.
- **The HeroUI Pro replacements** (segment, list view, KPI tiles, emoji picker, select, command palette, theme switcher) are exercised by `04`, `10`, `11` and `12` in both `pnpm dev` runs.

## Timing

In an earlier no-site run, `15-push-preferences` "one switch turns this device on for every organization" failed twice, and it passed on the rerun that `no-site/` reports. The 30-second wait for the organization list ran out while Chrome was still subscribing to its push service. With 15 more seconds of waiting, the same test passed in no-site mode. In the `site` run it took 28.4 s, just under the limit. It is the subscription round trip on this machine, not the missing site.

## Alchemy plan against production (read-only, from the original run)

`pnpm build`, then `pnpm exec alchemy plan --stage prod --env-file .env.local --no-input`. `alchemy.run.ts` is unchanged since.

- **Both `EMITKIT_DOMAIN=emitkit.com` and `EMITKIT_SITE_HOST=emitkit.com` set:**
  - Every resource and binding is a noop apart from the Worker script update.
  - The domains are unchanged.
  - `AUTUMN_SECRET_KEY` and `AUTUMN_WEBHOOK_SECRET` show as unbind because the `.env.local` used had no `EMITKIT_AUTUMN_*` values. That was already so before this change.
- **Only `EMITKIT_DOMAIN=emitkit.com` set:**
  - The Worker's domain changes from `emitkit.com` to `app.emitkit.com` (with alias `api.`). Today it has aliases `app.`, `api.` and `docs.`, plus the redirect `www.`.
  - `SITE_URL` is unbound.
  - So the hosted deploy must set `EMITKIT_SITE_HOST=emitkit.com`.

## By hand

- **Revenue hint padding:** checked by hand. A fresh workspace with one event and no revenue shows the "Send amount and currency…" hint aligned with the tile's title. The tile's `p-4` plus the hint's own `px-4 pb-4` had doubled its inset.
- **Email wordmark:** not covered. Nobody sent a real email and checked that the wordmark loads from `https://<app host>/email-wordmark.png`. The scenario only checks that the file is served there.

## Secrets

Before committing, the traces, logs and reports were unpacked and searched.

- Every `cookie`, `set-cookie`, `authorization` and `x-api-key` value is `[REDACTED]`.
- No `emitkit_…` key and no test password appears.
