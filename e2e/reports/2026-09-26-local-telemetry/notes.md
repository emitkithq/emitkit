# Operator telemetry (trakoo → EmitKit + OpenPanel) — 2026-09-26

The runs tested the uncommitted working tree on top of `785a751` (the commit each `report.md` names). After them, one change was made: the `seats_added` telemetry in `Billing.setSeats` moved into the background, and that path has no E2E coverage (see the end).

The scenario was `17-telemetry.spec.ts` in these runs (the report and file names keep it); it's `18-telemetry.spec.ts` now, since `17` went to the brand scenario on `main`.

The first five runs predate the code-review fixes; `review-fixes-telemetry/` and `review-fixes-regression/` re-run on top of `3dba4f2` with them (see [Code-review fixes](#code-review-fixes)).

Local runs, each with its own `report.md`, traces, screenshots and logs. Payloads the Worker sent to OpenPanel are under each test's `logs/*-openpanel-requests.json`.

| Run | Server | Scenarios | Result |
| --- | --- | --- | --- |
| [`telemetry/`](telemetry/report.md) | `pnpm dev`, telemetry on (OpenPanel → local capture, EmitKit → a made-up key), billing on (Autumn sandbox + a made-up webhook secret) | `17` | 6 passed |
| [`build/`](build/report.md) | the production build under `wrangler dev`, telemetry on, billing off | `17` | 5 passed, 1 skipped (billing) |
| [`build-2.1.1/`](build-2.1.1/report.md) | the same, on the released `@emitkit/js` 2.1.1 instead of the patched 2.1.0 | `17` | 5 passed, 1 skipped (billing); EmitKit answers 401, no "Illegal invocation" |
| [`regression/`](regression/report.md) | `pnpm dev`, telemetry on, billing off | `01 02 03 04 06 10 11 14 15 17` | 47 passed, 1 failed (see below), 11 skipped |
| [`self-host/`](self-host/report.md) | `pnpm dev`, no telemetry keys, billing off (the self-hosting default) | same | 42 passed, 1 failed (see below), 16 skipped |
| [`review-fixes-telemetry/`](review-fixes-telemetry/report.md) | `pnpm dev`, telemetry on, billing on (Autumn sandbox + a made-up webhook secret) | `18` | 6 passed |
| [`review-fixes-regression/`](review-fixes-regression/report.md) | `pnpm dev`, telemetry on, billing off | `06 14 18` | 11 passed, 6 skipped |

## Reproduce

`.dev.vars` in a worktree is a symlink to the main checkout: replace it with a copy first, and put the symlink back afterwards.

```bash
# telemetry/: add to the .dev.vars copy
#   TELEMETRY_OPENPANEL_CLIENT_ID=e2e-telemetry
#   TELEMETRY_OPENPANEL_CLIENT_SECRET=<anything>
#   TELEMETRY_OPENPANEL_API_URL=http://127.0.0.1:55071
#   TELEMETRY_EMITKIT_API_KEY=emitkit_notarealkey0
#   AUTUMN_SECRET_KEY=am_sk_test_…            (sandbox; optional, for the billing test)
#   AUTUMN_WEBHOOK_SECRET=whsec_<base64>      (made up; optional, same)
pnpm db:migrate:local
PORT=55070 pnpm dev
PORT=55070 E2E_TELEMETRY_PORT=55071 E2E_AUTUMN_WEBHOOK_SECRET=<the same whsec_> \
  pnpm exec playwright test 18-telemetry && E2E_TARGET=local pnpm e2e:report

# build/
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state \
  --var APP_URL:http://app.emitkit.localhost:8788 --var SITE_URL:http://emitkit.localhost:8788 \
  --var API_URL:http://api.emitkit.localhost:8788 \
  --var TELEMETRY_OPENPANEL_CLIENT_ID:e2e-telemetry --var TELEMETRY_OPENPANEL_CLIENT_SECRET:x \
  --var TELEMETRY_OPENPANEL_API_URL:http://127.0.0.1:55071 --var TELEMETRY_EMITKIT_API_KEY:emitkit_notarealkey0
E2E_SITE_URL=http://emitkit.localhost:8788 E2E_APP_URL=http://app.emitkit.localhost:8788 \
  E2E_API_URL=http://api.emitkit.localhost:8788 E2E_ORIGIN=http://app.emitkit.localhost:8788 \
  E2E_TELEMETRY_PORT=55071 pnpm exec playwright test 18-telemetry

# regression/ and self-host/: the telemetry keys (without Autumn) or no keys at all
PORT=55070 E2E_TELEMETRY_PORT=55071 pnpm exec playwright test 01-routing 02-public-api 03-auth \
  04-dashboard 06-account 10-projects 11-channels 14-billing 15-push 18-telemetry

# review-fixes-telemetry/: as telemetry/, `18-telemetry` only
# review-fixes-regression/: the telemetry keys without Autumn
PORT=55070 E2E_TELEMETRY_PORT=55071 pnpm exec playwright test 06-account 14-billing 18-telemetry
```

`pnpm e2e:report` writes `<date>-local/`; each run's directory was moved here afterwards.

## What the runs show

- **Sign-up** (`new_signup`): reported with the sign-up request's user agent (OpenPanel reads it from the header), a profile (`identify`: email, first name) and the push text `E2E telemetry (<email>) signed up with email and password.`
- **Activation**: `organization_created` and `test_event_sent` go to OpenPanel only. The dashboard's test event is not the organization's first event; the first event through the API is (`first_event_received`). 100 API events is `milestone_reached`, once.
- **Billing**: signed `billing.updated` webhooks with Autumn's actions and tags become `trial_started` (no `amount`: nothing is charged yet), `trial_converted`, `payment_failed`, `subscription_canceled`, `plan_changed`, `lifetime_purchased`, `subscription_ended`. Revenue events carry `amount` + `currency`. The hidden `comp` plan reports nothing. `checkout_started` is reported once Autumn opens the checkout (since the review fixes; before, as it started). The sandbox's Stripe account refused the session itself ("valid head office address" for automatic tax), which is a sandbox setting and not part of this change.
- **Churn**: `organization_deleted` and `account_deleted`, and (since the review fixes) `organization_deleted` for each organization deleted with its owner's account.
- **Filter**: E2E accounts (`e2e+…@example.com`, `…+emitkit-e2e-…`) and `dev@example.com` report nothing.
- **EmitKit routing**: EmitKit can't be captured, because the SDK always posts to api.emitkit.com. With a made-up key, the Worker log (`*/emitkit-provider-log.txt`) shows exactly the pushed events reaching the EmitKit provider and being refused with 401: 5 in `build/` (sign-up, first event, milestone, two deletions) plus one identify, and 12 in `telemetry/` (those 5 plus the 7 billing events). OpenPanel-only events (`organization_created`, `test_event_sent`, `checkout_started`) never reached it.
- **`@emitkit/js` in Workers**: the first run failed every EmitKit call with `Illegal invocation`. SDK 2.1.0 stores `globalThis.fetch` and calls it as a method of its config object, which workerd rejects. The runs above used a local pnpm patch for that; the fix then shipped as `@emitkit/js` 2.1.1 ([emitkithq/sdks](https://github.com/emitkithq/sdks/releases/tag/%40emitkit/js%402.1.1)), the patch was dropped, and `build-2.1.1/` re-runs the production build on the released SDK.
- **Self-host**: with no keys, the Worker log has no telemetry lines and every flow behaves as before.

## The one failure

`15-push-preferences` fails its first test only when it runs right after other sign-up-heavy scenarios. Its setup posts a sign-up without `postAuth`'s retry, and the trace shows Better Auth's sign-up rate limit answering `429`. It fails the same way with no telemetry keys (`self-host/`), and it passes on its own (4/4) in both configurations.

## Code-review fixes

Changes after the review of PR #12, and what checks them:

- **A trial whose first charge fails** (`trial_ended` tag with `past_due: true`) is `payment_failed` only, no `trial_converted`. Scenario `18` sends that webhook, then the successful one. With the guard removed, the scenario fails (the stray `trial_converted` appears).
- **Organizations deleted with an account** are reported as `organization_deleted`, from the deleted user. Scenario `18` creates a second organization and deletes the account. With the tracking removed, the scenario fails (`OpenPanel never received "organization_deleted"`).
- **`checkout_started`** only after Autumn returns: the sandbox still refuses the Stripe session, so these runs check that nothing is reported. The positive path needs the tax setting fixed (<https://dashboard.stripe.com/test/settings/tax>, head office address).
- **Billing webhook**: telemetry is queued after the push notice, so a notice failure that Autumn retries doesn't report the change twice. Not exercised: the notice can't be made to fail from the scenario.
- **Milestone seed**: migration `0006` seeds `organization_usage` for organizations whose projects already have a first event. The local D1 had applied it as `0005_organization_usage` before `main`'s renumbering, so the table and its record were dropped and `0006` re-applied. The one existing organization with events got `events = 102`, its D1 event count, and no organization with events was left without a row. With Analytics Engine (production), the D1 `event` table only holds the hot buffer (the last ~25 hours), so the seed is `max(1, events in the buffer)`; `max(1, 0)` was checked to give 1.
- **Seats**: `seats_removed` joins `seats_added`, and both are built in `billing-telemetry.ts`. Not exercised (see below).
- `06-account-pwa` with billing **on** failed its first test (profile rename ended on the sign-in page after 2 minutes). With billing off, as in `regression/`, `06` passes in full. It wasn't run against `main` with billing on, so whether that failure predates this branch is unknown.

## Not covered here

- A real delivery into emitkit.com and OpenPanel Cloud. That needs the production keys. After the deploy, sign up with a real address, then check that the `signups` channel pushes and that OpenPanel shows the event and the profile.
- Seat changes (`seats_added`, `seats_removed`) need a live sandbox subscription, and Stripe's sandbox checkout is blocked by the tax setting above.
- The billing webhook's ordering against a failing push notice, and the milestone seed on a production-sized D1.
