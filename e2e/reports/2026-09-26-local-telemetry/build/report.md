# EmitKit E2E report — local, 2026-09-26

- Target: **local**
- Commit: `785a751`
- Started: 2026-09-26T13:44:14.515Z · duration 5s
- Result: **5 passed, 0 failed, 1 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `17-telemetry.spec.ts` | a sign-up is identified and reported with its request | 0.1s | [openpanel requests](logs/17-telemetry-a-sign-up-is-identified-and-reported-with-its-request-openpanel-requests.json) · [trace](traces/17-telemetry-a-sign-up-is-identified-and-reported-with-its-request.zip) |
| ✅ | `17-telemetry.spec.ts` | the workspace, the setup guide's test event and a first real event | 0.3s | [http log](logs/17-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.json) · [openpanel requests](logs/17-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event-openpanel-requests.json) · [trace](traces/17-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.zip) |
| ✅ | `17-telemetry.spec.ts` | 100 events through the API is a milestone, reported once | 0.9s | [http log](logs/17-telemetry-100-events-through-the-api-is-a-milestone-reported-once.json) · [openpanel requests](logs/17-telemetry-100-events-through-the-api-is-a-milestone-reported-once-openpanel-requests.json) · [trace](traces/17-telemetry-100-events-through-the-api-is-a-milestone-reported-once.zip) |
| ⏭️ | `17-telemetry.spec.ts` | checkout and Autumn's billing webhooks become billing events | 0.0s | [openpanel requests](logs/17-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events-openpanel-requests.json) · [trace](traces/17-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events.zip) |
| ✅ | `17-telemetry.spec.ts` | deleting the organization and the account is reported as churn | 0.1s | [openpanel requests](logs/17-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn-openpanel-requests.json) · [trace](traces/17-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.zip) |
| ✅ | `17-telemetry.spec.ts` | E2E and dev accounts are never reported | 3.1s | [http log](logs/17-telemetry-e2e-and-dev-accounts-are-never-reported.json) · [openpanel requests](logs/17-telemetry-e2e-and-dev-accounts-are-never-reported-openpanel-requests.json) · [trace](traces/17-telemetry-e2e-and-dev-accounts-are-never-reported.zip) |
