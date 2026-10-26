# Hosted billing against the Autumn sandbox (local, 2026-09-25)

`report.md` covers `14-billing.spec.ts` with billing **on**: `pnpm dev` with an Autumn **sandbox** key (`AUTUMN_SECRET_KEY=am_sk_test_…`) and a made-up `AUTUMN_WEBHOOK_SECRET` in the worktree's own `.dev.vars` (a copy, not the symlink to the main checkout). The billing-off run of the whole suite is in `../2026-09-25-local-billing-off/`.

## Rerun

```bash
# .dev.vars: AUTUMN_SECRET_KEY=am_sk_test_…  AUTUMN_WEBHOOK_SECRET=whsec_<base64>
pnpm db:migrate:local && pnpm dev
E2E_AUTUMN_WEBHOOK_SECRET=<same whsec> pnpm exec playwright test 14-billing
E2E_TARGET=local pnpm e2e:report   # then rename the folder
```

The plans come from `autumn.config.ts`; `pnpm billing:push` showed "No changes" against the sandbox before the run.

## What was arranged outside HTTP

Local Web Push can't be delivered (see `05-push-pwa`), so "the organization's first push was delivered" was set directly in local D1 (`organization_billing.first_push_at`). In production, `Notifications.deliver` sets it after the first event push that reaches a device.

## Checked by hand

- Stripe's test checkout (card 4242…, driven by the scenario) returned to Settings → Billing with the Solo trial. Autumn's customer showed `solo` / `trialing`, then 2 seats after the seat change.
- Deleting the organization cancels its subscription in Autumn: after the final run the test customer had no subscriptions. Four customers from earlier runs, where cleanup raced an in-flight seat update and Autumn answered 423, were cancelled by hand. The client now retries Autumn's 423 lock.
- Autumn's real webhook can't reach a local server. The signature check was exercised with locally signed Svix payloads (valid → 204, unsigned or tampered → 401).

## Not covered here

- A real push from a live `billing.updated` event (payment failed, plan ended, trial ended). This needs production or a tunnelled dev server with the webhook configured in Autumn.
- Trial expiry and a failed renewal (Stripe test clocks).
- Production. Billing is off there until `EMITKIT_AUTUMN_SECRET_KEY` is set at deploy.
