# EmitKit E2E report — local, 2026-09-24

- Target: **local**
- Commit: `a97f3ff`
- Started: 2026-09-24T14:11:48.175Z · duration 23s
- Result: **22 passed, 0 failed, 7 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `01-routing.spec.ts` | marketing site serves prerendered pages | 0.1s | [trace](traces/01-routing-marketing-site-serves-prerendered-pages.zip) |
| ✅ | `01-routing.spec.ts` | site assets and SEO files | 0.0s | [trace](traces/01-routing-site-assets-and-seo-files.zip) |
| ⏭️ | `01-routing.spec.ts` | www redirects to the apex (production only) | 0.0s | [trace](traces/01-routing-www-redirects-to-the-apex-production-only.zip) |
| ✅ | `01-routing.spec.ts` | app host serves the PWA shell, manifest and service worker | 0.0s | [trace](traces/01-routing-app-host-serves-the-pwa-shell-manifest-and-service-worker.zip) |
| ✅ | `01-routing.spec.ts` | api host serves health and the OpenAPI document | 0.0s | [trace](traces/01-routing-api-host-serves-health-and-the-openapi-document.zip) |
| ✅ | `02-public-api.spec.ts` | SDK creates events with rate-limit info and request ids | 0.0s | [http log](logs/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.json) · [trace](traces/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.zip) |
| ✅ | `02-public-api.spec.ts` | SDK idempotency replays the first response | 0.0s | [http log](logs/02-public-api-sdk-idempotency-replays-the-first-response.json) · [trace](traces/02-public-api-sdk-idempotency-replays-the-first-response.zip) |
| ✅ | `02-public-api.spec.ts` | SDK identify merges properties and claims aliases | 0.0s | [trace](traces/02-public-api-sdk-identify-merges-properties-and-claims-aliases.zip) |
| ✅ | `02-public-api.spec.ts` | SDK surfaces validation errors | 0.0s | [trace](traces/02-public-api-sdk-surfaces-validation-errors.zip) |
| ✅ | `02-public-api.spec.ts` | raw HTTP error contract | 0.1s | [http log](logs/02-public-api-raw-http-error-contract.json) · [trace](traces/02-public-api-raw-http-error-contract.zip) |
| ✅ | `02-public-api.spec.ts` | routing contract | 0.0s | [http log](logs/02-public-api-routing-contract.json) · [trace](traces/02-public-api-routing-contract.zip) |
| ✅ | `02-public-api.spec.ts` | identity erasure | 0.0s | [trace](traces/02-public-api-identity-erasure.zip) |
| ✅ | `02-public-api.spec.ts` | events are visible in the dashboard immediately | 0.0s | [http log](logs/02-public-api-events-are-visible-in-the-dashboard-immediately.json) · [trace](traces/02-public-api-events-are-visible-in-the-dashboard-immediately.zip) |
| ✅ | `02-public-api.spec.ts` | MCP: initialize, list tools, create an event | 0.0s | [http log](logs/02-public-api-mcp-initialize-list-tools-create-an-event.json) · [trace](traces/02-public-api-mcp-initialize-list-tools-create-an-event.zip) |
| ✅ | `02-public-api.spec.ts` | MCP transport: methods, notifications, every tool, shared request id | 0.0s | [http log](logs/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.json) · [trace](traces/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.zip) |
| ✅ | `02-public-api.spec.ts` | rate limit: the 101st request in a minute gets 429 with Retry-After | 0.6s | [http log](logs/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.json) · [trace](traces/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.zip) |
| ✅ | `04-dashboard.spec.ts` | getting started: workspace, starter key, first event | 5.8s | [screenshot](screenshots/04-dashboard-getting-started-workspace-starter-key-first-event-test-finished-1.png) · [trace](traces/04-dashboard-getting-started-workspace-starter-key-first-event.zip) |
| ✅ | `04-dashboard.spec.ts` | events feed: live updates, pulse, search, channel, details, delete | 7.8s | [screenshot](screenshots/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete-test-finished-1.png) · [trace](traces/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete.zip) |
| ✅ | `04-dashboard.spec.ts` | projects and channels: create, suggest emoji, delete, restore | 2.5s | [screenshot](screenshots/04-dashboard-projects-and-channels-create-suggest-emoji-delete-restore-test-finished-1.png) · [trace](traces/04-dashboard-projects-and-channels-create-suggest-emoji-delete-restore.zip) |
| ✅ | `04-dashboard.spec.ts` | API keys: create, rotate, revoke | 1.2s | [screenshot](screenshots/04-dashboard-api-keys-create-rotate-revoke-test-finished-1.png) · [trace](traces/04-dashboard-api-keys-create-rotate-revoke.zip) |
| ✅ | `04-dashboard.spec.ts` | members: invite and cancel | 0.3s | [screenshot](screenshots/04-dashboard-members-invite-and-cancel-test-finished-1.png) · [trace](traces/04-dashboard-members-invite-and-cancel.zip) |
| ✅ | `04-dashboard.spec.ts` | members: an unverified invitee is asked to verify before accepting | 0.8s | [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-1.png) · [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-2.png) · [trace](traces/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting.zip) |
| ✅ | `04-dashboard.spec.ts` | organization switcher keeps workspaces apart | 1.4s | [screenshot](screenshots/04-dashboard-organization-switcher-keeps-workspaces-apart-test-finished-1.png) · [trace](traces/04-dashboard-organization-switcher-keeps-workspaces-apart.zip) |
| ⏭️ | `07-docs.spec.ts` | docs home and a guide render with their assets | 0.0s |  |
| ⏭️ | `07-docs.spec.ts` | links and assets stay under /docs | 0.0s |  |
| ⏭️ | `07-docs.spec.ts` | API reference covers every operation in the published contract | 0.0s |  |
| ⏭️ | `07-docs.spec.ts` | search, sitemap and agent files | 0.0s |  |
| ⏭️ | `07-docs.spec.ts` | unknown pages get the docs 404, old paths redirect | 0.0s |  |
| ⏭️ | `07-docs.spec.ts` | content describes production, and the site links to it | 0.0s |  |
