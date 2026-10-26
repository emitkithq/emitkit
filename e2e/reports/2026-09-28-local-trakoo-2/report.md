# EmitKit E2E report — local, 2026-09-28

- Target: **local**
- Commit: `14fd21e`
- Started: 2026-09-28T14:32:47.080Z · duration 74s
- Result: **19 passed, 0 failed, 1 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `02-public-api.spec.ts` | SDK creates events with rate-limit info and request ids | 0.1s | [http log](logs/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.json) · [trace](traces/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.zip) |
| ✅ | `02-public-api.spec.ts` | SDK idempotency replays the first response | 0.1s | [http log](logs/02-public-api-sdk-idempotency-replays-the-first-response.json) · [trace](traces/02-public-api-sdk-idempotency-replays-the-first-response.zip) |
| ✅ | `02-public-api.spec.ts` | SDK identify merges properties and claims aliases | 0.0s | [trace](traces/02-public-api-sdk-identify-merges-properties-and-claims-aliases.zip) |
| ✅ | `02-public-api.spec.ts` | SDK surfaces validation errors | 0.0s | [trace](traces/02-public-api-sdk-surfaces-validation-errors.zip) |
| ✅ | `02-public-api.spec.ts` | raw HTTP error contract | 0.0s | [http log](logs/02-public-api-raw-http-error-contract.json) · [trace](traces/02-public-api-raw-http-error-contract.zip) |
| ✅ | `02-public-api.spec.ts` | routing contract | 0.1s | [http log](logs/02-public-api-routing-contract.json) · [trace](traces/02-public-api-routing-contract.zip) |
| ✅ | `02-public-api.spec.ts` | identity erasure | 0.0s | [trace](traces/02-public-api-identity-erasure.zip) |
| ✅ | `02-public-api.spec.ts` | events are visible in the dashboard immediately | 0.0s | [http log](logs/02-public-api-events-are-visible-in-the-dashboard-immediately.json) · [trace](traces/02-public-api-events-are-visible-in-the-dashboard-immediately.zip) |
| ✅ | `02-public-api.spec.ts` | MCP: initialize, list tools, create an event | 0.1s | [http log](logs/02-public-api-mcp-initialize-list-tools-create-an-event.json) · [trace](traces/02-public-api-mcp-initialize-list-tools-create-an-event.zip) |
| ✅ | `02-public-api.spec.ts` | MCP transport: methods, notifications, every tool, shared request id | 0.1s | [http log](logs/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.json) · [trace](traces/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.zip) |
| ✅ | `02-public-api.spec.ts` | rate limit: the 101st request in a minute gets 429 with Retry-After | 1.0s | [http log](logs/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.json) · [trace](traces/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.zip) |
| ✅ | `02-public-api.spec.ts` | rate limit: a steady client gets a fresh window every minute | 61.9s | [http log](logs/02-public-api-rate-limit-a-steady-client-gets-a-fresh-window-every-minute.json) · [trace](traces/02-public-api-rate-limit-a-steady-client-gets-a-fresh-window-every-minute.zip) |
| ✅ | `18-telemetry.spec.ts` | a sign-up is identified and reported with its request | 0.1s | [openpanel requests](logs/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request-openpanel-requests.json) · [trace](traces/18-telemetry-a-sign-up-is-identified-and-reported-with-its-request.zip) |
| ✅ | `18-telemetry.spec.ts` | the workspace, the setup guide's test event and a first real event | 0.1s | [http log](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.json) · [openpanel requests](logs/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event-openpanel-requests.json) · [trace](traces/18-telemetry-the-workspace-the-setup-guide-s-test-event-and-a-first-real-event.zip) |
| ✅ | `18-telemetry.spec.ts` | 100 events through the API is a milestone, reported once | 1.4s | [http log](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.json) · [openpanel requests](logs/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once-openpanel-requests.json) · [trace](traces/18-telemetry-100-events-through-the-api-is-a-milestone-reported-once.zip) |
| ⏭️ | `18-telemetry.spec.ts` | checkout and Autumn's billing webhooks become billing events | 0.0s | [openpanel requests](logs/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events-openpanel-requests.json) · [trace](traces/18-telemetry-checkout-and-autumn-s-billing-webhooks-become-billing-events.zip) |
| ✅ | `18-telemetry.spec.ts` | deleting the organization and the account is reported as churn | 0.1s | [http log](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.json) · [openpanel requests](logs/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn-openpanel-requests.json) · [trace](traces/18-telemetry-deleting-the-organization-and-the-account-is-reported-as-churn.zip) |
| ✅ | `18-telemetry.spec.ts` | E2E and dev accounts are never reported | 3.2s | [http log](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported.json) · [openpanel requests](logs/18-telemetry-e2e-and-dev-accounts-are-never-reported-openpanel-requests.json) · [trace](traces/18-telemetry-e2e-and-dev-accounts-are-never-reported.zip) |
| ✅ | `18-telemetry.spec.ts` | site and docs pages report anonymous page views, private query left out | 1.5s | [screenshot](screenshots/18-telemetry-site-and-docs-pages-report-anonymous-page-views-private-query-left--test-finished-1.png) · [openpanel requests](logs/18-telemetry-site-and-docs-pages-report-anonymous-page-views-private-query-left--openpanel-requests.json) · [trace](traces/18-telemetry-site-and-docs-pages-report-anonymous-page-views-private-query-left-.zip) |
| ✅ | `18-telemetry.spec.ts` | the dashboard names the signed-in user and forgets them at sign-out | 2.2s | [screenshot](screenshots/18-telemetry-the-dashboard-names-the-signed-in-user-and-forgets-them-at-sign-out-test-finished-1.png) · [openpanel requests](logs/18-telemetry-the-dashboard-names-the-signed-in-user-and-forgets-them-at-sign-out-openpanel-requests.json) · [trace](traces/18-telemetry-the-dashboard-names-the-signed-in-user-and-forgets-them-at-sign-out.zip) |
