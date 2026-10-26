# EmitKit E2E report — local, 2026-09-25

- Target: **local**
- Commit: `22df1aa`
- Started: 2026-09-25T14:13:02.370Z · duration 33s
- Result: **5 passed, 0 failed, 1 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ⏭️ | `14-billing.spec.ts` | billing off: nothing is gated | 0.0s | [screenshot](screenshots/14-billing-billing-off-nothing-is-gated-test-finished-1.png) · [http log](logs/14-billing-billing-off-nothing-is-gated.json) · [trace](traces/14-billing-billing-off-nothing-is-gated.zip) |
| ✅ | `14-billing.spec.ts` | setup: free until the first push, no invites before a plan | 2.8s | [screenshot](screenshots/14-billing-setup-free-until-the-first-push-no-invites-before-a-plan-test-finished-1.png) · [http log](logs/14-billing-setup-free-until-the-first-push-no-invites-before-a-plan.json) · [trace](traces/14-billing-setup-free-until-the-first-push-no-invites-before-a-plan.zip) |
| ✅ | `14-billing.spec.ts` | paywall after the first push; events are still recorded | 1.8s | [screenshot](screenshots/14-billing-paywall-after-the-first-push-events-are-still-recorded-test-finished-1.png) · [http log](logs/14-billing-paywall-after-the-first-push-events-are-still-recorded.json) · [trace](traces/14-billing-paywall-after-the-first-push-events-are-still-recorded.zip) |
| ✅ | `14-billing.spec.ts` | trial through Stripe's test checkout | 16.4s | [screenshot](screenshots/14-billing-trial-through-stripe-s-test-checkout-test-finished-1.png) · [http log](logs/14-billing-trial-through-stripe-s-test-checkout.json) · [trace](traces/14-billing-trial-through-stripe-s-test-checkout.zip) |
| ✅ | `14-billing.spec.ts` | adding a seat shows the price first, then invites work | 5.8s | [screenshot](screenshots/14-billing-adding-a-seat-shows-the-price-first-then-invites-work-test-finished-1.png) · [http log](logs/14-billing-adding-a-seat-shows-the-price-first-then-invites-work.json) · [trace](traces/14-billing-adding-a-seat-shows-the-price-first-then-invites-work.zip) |
| ✅ | `14-billing.spec.ts` | the webhook only accepts Autumn's signature | 0.2s | [screenshot](screenshots/14-billing-the-webhook-only-accepts-autumn-s-signature-test-finished-1.png) · [trace](traces/14-billing-the-webhook-only-accepts-autumn-s-signature.zip) |
