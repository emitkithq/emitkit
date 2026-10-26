# EmitKit E2E report — local, 2026-09-26

- Target: **local**
- Commit: `3dba4f2`
- Started: 2026-09-26T15:18:59.161Z · duration 17s
- Result: **6 passed, 0 failed, 0 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `18-telemetry.spec.ts` | a sign-up is identified and reported with its request | 0.1s | [openpanel requests](logs/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request-openpanel-requests.json) · [trace](traces/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request.zip) |
| ✅ | `18-telemetry.spec.ts` | the workspace, the setup guide's test event and a first real event | 1.6s | [http log](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.json) · [openpanel requests](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event-openpanel-requests.json) · [trace](traces/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.zip) |
| ✅ | `18-telemetry.spec.ts` | 100 events through the API is a milestone, reported once | 0.9s | [http log](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.json) · [openpanel requests](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once-openpanel-requests.json) · [trace](traces/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.zip) |
| ✅ | `18-telemetry.spec.ts` | checkout and Autumn's billing webhooks become billing events | 10.5s | [http log](logs/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events.json) · [openpanel requests](logs/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events-openpanel-requests.json) · [trace](traces/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events.zip) |
| ✅ | `18-telemetry.spec.ts` | deleting the organization and the account is reported as churn | 0.4s | [http log](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.json) · [openpanel requests](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn-openpanel-requests.json) · [trace](traces/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.zip) |
| ✅ | `18-telemetry.spec.ts` | E2E and dev accounts are never reported | 3.5s | [http log](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported.json) · [openpanel requests](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported-openpanel-requests.json) · [trace](traces/18-telemetry-e2e-and-dev-accounts-are-never-reported.zip) |
