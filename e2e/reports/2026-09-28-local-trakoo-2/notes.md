# trakoo 2 and @emitkit/js 3 — 2026-09-28

Tested the uncommitted working tree on top of `14fd21e` (the commit `report.md` names): trakoo 2.0.0 with its EmitKit and OpenPanel providers from `@trakoo/emitkit` 1.0.0 and `@trakoo/openpanel` 1.0.0, and `@emitkit/js` 3.0.0. The run is a production build (`pnpm build`) under `wrangler dev`, with OpenPanel pointed at the scenario's local stand-in and EmitKit given a made-up key.

| Run | Server | Scenarios | Result |
| --- | --- | --- | --- |
| [`report.md`](report.md) | the production build under `wrangler dev`, telemetry on, billing off | `02 18` | 19 passed, 1 skipped (billing) |
| not kept | `pnpm dev`, the same telemetry settings | `02 18` | `02`: 12 passed. `18`: 5 passed, then the site and docs page views failed at `page.goto(/docs)` with a 404, because `pnpm dev` doesn't serve the docs (`pnpm build` bundles them); the dashboard test didn't run |

## Reproduce

```bash
# a .dev.vars copy (not the symlink) with
#   TELEMETRY_OPENPANEL_CLIENT_ID=e2e-telemetry
#   TELEMETRY_OPENPANEL_CLIENT_SECRET=<anything>
#   TELEMETRY_OPENPANEL_API_URL=http://127.0.0.1:55171
#   TELEMETRY_EMITKIT_API_KEY=emitkit_notarealkey0
pnpm build && pnpm db:migrate:local
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 55172 --persist-to .wrangler/state \
  --var APP_URL:http://app.emitkit.localhost:55172 --var SITE_URL:http://emitkit.localhost:55172 \
  --var API_URL:http://api.emitkit.localhost:55172
E2E_SITE_URL=http://emitkit.localhost:55172 E2E_APP_URL=http://app.emitkit.localhost:55172 \
  E2E_API_URL=http://api.emitkit.localhost:55172 E2E_ORIGIN=http://app.emitkit.localhost:55172 \
  E2E_TELEMETRY_PORT=55171 pnpm exec playwright test 02-public-api 18-telemetry
E2E_TARGET=local pnpm e2e:report
```

## What the run shows

- `02-public-api` exercises the API through `@emitkit/js` 3: the event comes back directly, and the request id, rate limit and replay flag are read from `lastResponse`. `identify` takes `userId`, and an empty event is rejected with an `EmitKitError` whose `code` is `validation_error` and `status` is 400.
- With `@trakoo/openpanel`, what OpenPanel receives passes every payload check in `18` (not diffed against a trakoo 1 run). The sign-up's `openpanel-client-ip` and `user-agent` headers still arrive, and the SDK transport is recognised (no "Unrecognized @openpanel/sdk transport" warning). The site, docs and dashboard page views load the provider lazily from `@trakoo/openpanel/client`.
- EmitKit: every push is posted to `api.emitkit.com` and answered with 401 (made-up key). The Worker logs `[EmitKit-Server] Failed to track event (EmitKitError unauthorized 401 request …)`, which shows `@emitkit/js` 3 loads and calls `fetch` in workerd without "Illegal invocation".
- The page-view module is still 2 KB (`visits-*.js`). The Worker still loads `@emitkit/js` and `@openpanel/sdk` as separate lazy chunks, and the browser loads `@openpanel/web` the same way.

## Not covered here

- The billing test (no Autumn sandbox key).
- A real EmitKit delivery: without a real key the push itself (`source: "trakoo"`, no visitor IP in metadata) isn't observed.
