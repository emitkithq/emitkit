# EmitKit E2E report — local, 2026-09-26

- Target: **local**
- Commit: `3dba4f2`
- Started: 2026-09-26T15:18:24.736Z · duration 23s
- Result: **11 passed, 0 failed, 6 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `06-account-pwa.spec.ts` | profile: rename yourself | 3.3s | [screenshot](screenshots/06-account-pwa-profile-rename-yourself-test-finished-1.png) · [trace](traces/06-account-pwa-profile-rename-yourself.zip) |
| ✅ | `06-account-pwa.spec.ts` | password: change it, then only the new one signs in | 1.8s | [screenshot](screenshots/06-account-pwa-password-change-it-then-only-the-new-one-signs-in-test-finished-1.png) · [trace](traces/06-account-pwa-password-change-it-then-only-the-new-one-signs-in.zip) |
| ✅ | `06-account-pwa.spec.ts` | organization: rename and re-slug | 3.1s | [screenshot](screenshots/06-account-pwa-organization-rename-and-re-slug-test-finished-1.png) · [trace](traces/06-account-pwa-organization-rename-and-re-slug.zip) |
| ⏭️ | `06-account-pwa.spec.ts` | PWA: install prompt and new-version notice | 1.6s | [screenshot](screenshots/06-account-pwa-pwa-install-prompt-and-new-version-notice-test-finished-1.png) · [trace](traces/06-account-pwa-pwa-install-prompt-and-new-version-notice.zip) |
| ✅ | `06-account-pwa.spec.ts` | deleting an organization revokes its API keys | 2.1s | [screenshot](screenshots/06-account-pwa-deleting-an-organization-revokes-its-api-keys-test-finished-1.png) · [trace](traces/06-account-pwa-deleting-an-organization-revokes-its-api-keys.zip) |
| ✅ | `06-account-pwa.spec.ts` | deleting the account deletes the organizations it owns alone | 1.7s | [screenshot](screenshots/06-account-pwa-deleting-the-account-deletes-the-organizations-it-owns-alone-test-finished-1.png) · [trace](traces/06-account-pwa-deleting-the-account-deletes-the-organizations-it-owns-alone.zip) |
| ✅ | `14-billing.spec.ts` | billing off: nothing is gated | 1.6s | [screenshot](screenshots/14-billing-billing-off-nothing-is-gated-test-finished-1.png) · [http log](logs/14-billing-billing-off-nothing-is-gated.json) · [trace](traces/14-billing-billing-off-nothing-is-gated.zip) |
| ⏭️ | `14-billing.spec.ts` | a new organization starts on the trial paywall | 0.0s | [screenshot](screenshots/14-billing-a-new-organization-starts-on-the-trial-paywall-test-finished-1.png) · [trace](traces/14-billing-a-new-organization-starts-on-the-trial-paywall.zip) |
| ⏭️ | `14-billing.spec.ts` | the trial starts through Stripe's test checkout and lands in the setup guide | 0.0s | [screenshot](screenshots/14-billing-the-trial-starts-through-stripe-s-test-checkout-and-lands-in-the-setu-test-finished-1.png) · [trace](traces/14-billing-the-trial-starts-through-stripe-s-test-checkout-and-lands-in-the-setu.zip) |
| ⏭️ | `14-billing.spec.ts` | adding a seat shows the price first, then invites work | 0.0s | [screenshot](screenshots/14-billing-adding-a-seat-shows-the-price-first-then-invites-work-test-finished-1.png) · [trace](traces/14-billing-adding-a-seat-shows-the-price-first-then-invites-work.zip) |
| ⏭️ | `14-billing.spec.ts` | the webhook only accepts Autumn's signature | 0.0s | [screenshot](screenshots/14-billing-the-webhook-only-accepts-autumn-s-signature-test-finished-1.png) · [trace](traces/14-billing-the-webhook-only-accepts-autumn-s-signature.zip) |
| ✅ | `18-telemetry.spec.ts` | a sign-up is identified and reported with its request | 0.3s | [openpanel requests](logs/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request-openpanel-requests.json) · [trace](traces/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request.zip) |
| ✅ | `18-telemetry.spec.ts` | the workspace, the setup guide's test event and a first real event | 0.3s | [http log](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.json) · [openpanel requests](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event-openpanel-requests.json) · [trace](traces/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.zip) |
| ✅ | `18-telemetry.spec.ts` | 100 events through the API is a milestone, reported once | 0.8s | [http log](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.json) · [openpanel requests](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once-openpanel-requests.json) · [trace](traces/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.zip) |
| ⏭️ | `18-telemetry.spec.ts` | checkout and Autumn's billing webhooks become billing events | 0.0s | [openpanel requests](logs/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events-openpanel-requests.json) · [trace](traces/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events.zip) |
| ✅ | `18-telemetry.spec.ts` | deleting the organization and the account is reported as churn | 0.1s | [http log](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.json) · [openpanel requests](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn-openpanel-requests.json) · [trace](traces/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.zip) |
| ✅ | `18-telemetry.spec.ts` | E2E and dev accounts are never reported | 3.1s | [http log](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported.json) · [openpanel requests](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported-openpanel-requests.json) · [trace](traces/18-telemetry-e2e-and-dev-accounts-are-never-reported.zip) |
