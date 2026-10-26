# EmitKit E2E report — production, 2026-09-24

- Target: **production**
- Commit: `ca5b410`
- Started: 2026-09-24T19:55:40.696Z · duration 162s
- Result: **43 passed, 0 failed, 1 skipped**

Reproduce: `E2E_TARGET=production pnpm e2e && E2E_TARGET=production pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `01-routing.spec.ts` | marketing site serves prerendered pages | 0.6s | [trace](traces/01-routing-marketing-site-serves-prerendered-pages.zip) |
| ✅ | `01-routing.spec.ts` | site assets and SEO files | 0.5s | [trace](traces/01-routing-site-assets-and-seo-files.zip) |
| ✅ | `01-routing.spec.ts` | www redirects to the apex (production only) | 0.5s | [trace](traces/01-routing-www-redirects-to-the-apex-production-only.zip) |
| ✅ | `01-routing.spec.ts` | app host serves the PWA shell, manifest and service worker | 0.4s | [trace](traces/01-routing-app-host-serves-the-pwa-shell-manifest-and-service-worker.zip) |
| ✅ | `01-routing.spec.ts` | api host serves health and the OpenAPI document | 0.3s | [trace](traces/01-routing-api-host-serves-health-and-the-openapi-document.zip) |
| ✅ | `02-public-api.spec.ts` | SDK creates events with rate-limit info and request ids | 0.7s | [http log](logs/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.json) · [trace](traces/02-public-api-sdk-creates-events-with-rate-limit-info-and-request-ids.zip) |
| ✅ | `02-public-api.spec.ts` | SDK idempotency replays the first response | 1.6s | [http log](logs/02-public-api-sdk-idempotency-replays-the-first-response.json) · [trace](traces/02-public-api-sdk-idempotency-replays-the-first-response.zip) |
| ✅ | `02-public-api.spec.ts` | SDK identify merges properties and claims aliases | 0.3s | [trace](traces/02-public-api-sdk-identify-merges-properties-and-claims-aliases.zip) |
| ✅ | `02-public-api.spec.ts` | SDK surfaces validation errors | 0.1s | [trace](traces/02-public-api-sdk-surfaces-validation-errors.zip) |
| ✅ | `02-public-api.spec.ts` | raw HTTP error contract | 1.0s | [http log](logs/02-public-api-raw-http-error-contract.json) · [trace](traces/02-public-api-raw-http-error-contract.zip) |
| ✅ | `02-public-api.spec.ts` | routing contract | 1.4s | [http log](logs/02-public-api-routing-contract.json) · [trace](traces/02-public-api-routing-contract.zip) |
| ✅ | `02-public-api.spec.ts` | identity erasure | 0.5s | [trace](traces/02-public-api-identity-erasure.zip) |
| ✅ | `02-public-api.spec.ts` | events are visible in the dashboard immediately | 0.6s | [http log](logs/02-public-api-events-are-visible-in-the-dashboard-immediately.json) · [trace](traces/02-public-api-events-are-visible-in-the-dashboard-immediately.zip) |
| ✅ | `02-public-api.spec.ts` | MCP: initialize, list tools, create an event | 0.4s | [http log](logs/02-public-api-mcp-initialize-list-tools-create-an-event.json) · [trace](traces/02-public-api-mcp-initialize-list-tools-create-an-event.zip) |
| ✅ | `02-public-api.spec.ts` | MCP transport: methods, notifications, every tool, shared request id | 0.8s | [http log](logs/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.json) · [trace](traces/02-public-api-mcp-transport-methods-notifications-every-tool-shared-request-id.zip) |
| ✅ | `02-public-api.spec.ts` | rate limit: the 101st request in a minute gets 429 with Retry-After | 7.9s | [http log](logs/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.json) · [trace](traces/02-public-api-rate-limit-the-101st-request-in-a-minute-gets-429-with-retry-after.zip) |
| ✅ | `03-auth.spec.ts` | signed-out visitors are sent to sign-in | 1.4s | [screenshot](screenshots/03-auth-signed-out-visitors-are-sent-to-sign-in-test-finished-1.png) · [trace](traces/03-auth-signed-out-visitors-are-sent-to-sign-in.zip) |
| ✅ | `03-auth.spec.ts` | sign up, create a workspace, sign out, sign back in | 10.3s | [screenshot](screenshots/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in-test-finished-1.png) · [trace](traces/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in.zip) |
| ✅ | `03-auth.spec.ts` | password reset and magic link requests are accepted | 5.8s | [screenshot](screenshots/03-auth-password-reset-and-magic-link-requests-are-accepted-test-finished-1.png) · [trace](traces/03-auth-password-reset-and-magic-link-requests-are-accepted.zip) |
| ✅ | `04-dashboard.spec.ts` | getting started: workspace, starter key, first event | 8.6s | [screenshot](screenshots/04-dashboard-getting-started-workspace-starter-key-first-event-test-finished-1.png) · [trace](traces/04-dashboard-getting-started-workspace-starter-key-first-event.zip) |
| ✅ | `04-dashboard.spec.ts` | events feed: live updates, pulse, search, channel, details, delete | 10.0s | [screenshot](screenshots/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete-test-finished-1.png) · [trace](traces/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete.zip) |
| ✅ | `04-dashboard.spec.ts` | projects and channels: create, suggest emoji, delete, restore | 7.2s | [screenshot](screenshots/04-dashboard-projects-and-channels-create-suggest-emoji-delete-restore-test-finished-1.png) · [trace](traces/04-dashboard-projects-and-channels-create-suggest-emoji-delete-restore.zip) |
| ✅ | `04-dashboard.spec.ts` | API keys: create, rotate, revoke | 4.0s | [screenshot](screenshots/04-dashboard-api-keys-create-rotate-revoke-test-finished-1.png) · [trace](traces/04-dashboard-api-keys-create-rotate-revoke.zip) |
| ✅ | `04-dashboard.spec.ts` | settings: a modal over the current page; old addresses redirect | 3.3s | [screenshot](screenshots/04-dashboard-settings-a-modal-over-the-current-page-old-addresses-redirect-test-finished-1.png) · [trace](traces/04-dashboard-settings-a-modal-over-the-current-page-old-addresses-redirect.zip) |
| ✅ | `04-dashboard.spec.ts` | members: invite and cancel | 4.5s | [screenshot](screenshots/04-dashboard-members-invite-and-cancel-test-finished-1.png) · [trace](traces/04-dashboard-members-invite-and-cancel.zip) |
| ✅ | `04-dashboard.spec.ts` | members: an unverified invitee is asked to verify before accepting | 13.4s | [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-1.png) · [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-2.png) · [trace](traces/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting.zip) |
| ✅ | `04-dashboard.spec.ts` | organization switcher keeps workspaces apart | 4.6s | [screenshot](screenshots/04-dashboard-organization-switcher-keeps-workspaces-apart-test-finished-1.png) · [trace](traces/04-dashboard-organization-switcher-keeps-workspaces-apart.zip) |
| ✅ | `05-push-pwa.spec.ts` | Settings → Notifications delivers real pushes | 14.6s | [http log](logs/05-push-pwa-settings-notifications-delivers-real-pushes.json) · [screenshot](screenshots/05-push-pwa-settings-notifications-delivers-real-pushes-test-finished-1.png) · [trace](traces/05-push-pwa-settings-notifications-delivers-real-pushes.zip) |
| ✅ | `06-account-pwa.spec.ts` | profile: rename yourself | 3.1s | [screenshot](screenshots/06-account-pwa-profile-rename-yourself-test-finished-1.png) · [trace](traces/06-account-pwa-profile-rename-yourself.zip) |
| ✅ | `06-account-pwa.spec.ts` | password: change it, then only the new one signs in | 3.1s | [screenshot](screenshots/06-account-pwa-password-change-it-then-only-the-new-one-signs-in-test-finished-1.png) · [trace](traces/06-account-pwa-password-change-it-then-only-the-new-one-signs-in.zip) |
| ✅ | `06-account-pwa.spec.ts` | organization: rename and re-slug | 3.1s | [screenshot](screenshots/06-account-pwa-organization-rename-and-re-slug-test-finished-1.png) · [trace](traces/06-account-pwa-organization-rename-and-re-slug.zip) |
| ✅ | `06-account-pwa.spec.ts` | PWA: install prompt and new-version notice | 1.8s | [screenshot](screenshots/06-account-pwa-pwa-install-prompt-and-new-version-notice-test-finished-1.png) · [trace](traces/06-account-pwa-pwa-install-prompt-and-new-version-notice.zip) |
| ✅ | `06-account-pwa.spec.ts` | deleting an organization revokes its API keys | 4.9s | [screenshot](screenshots/06-account-pwa-deleting-an-organization-revokes-its-api-keys-test-finished-1.png) · [trace](traces/06-account-pwa-deleting-an-organization-revokes-its-api-keys.zip) |
| ✅ | `06-account-pwa.spec.ts` | deleting the account deletes the organizations it owns alone | 4.9s | [screenshot](screenshots/06-account-pwa-deleting-the-account-deletes-the-organizations-it-owns-alone-test-finished-1.png) · [trace](traces/06-account-pwa-deleting-the-account-deletes-the-organizations-it-owns-alone.zip) |
| ✅ | `07-docs.spec.ts` | docs home and a guide render with their assets | 1.4s | [screenshot](screenshots/07-docs-docs-home-and-a-guide-render-with-their-assets-test-finished-1.png) · [trace](traces/07-docs-docs-home-and-a-guide-render-with-their-assets.zip) |
| ✅ | `07-docs.spec.ts` | links and assets stay under /docs | 0.7s | [trace](traces/07-docs-links-and-assets-stay-under-docs.zip) |
| ✅ | `07-docs.spec.ts` | API reference covers every operation in the published contract | 1.2s | [trace](traces/07-docs-api-reference-covers-every-operation-in-the-published-contract.zip) |
| ✅ | `07-docs.spec.ts` | search, sitemap and agent files | 0.3s | [trace](traces/07-docs-search-sitemap-and-agent-files.zip) |
| ✅ | `07-docs.spec.ts` | unknown pages get the docs 404, old paths redirect | 1.1s | [screenshot](screenshots/07-docs-unknown-pages-get-the-docs-404-old-paths-redirect-test-finished-1.png) · [trace](traces/07-docs-unknown-pages-get-the-docs-404-old-paths-redirect.zip) |
| ✅ | `07-docs.spec.ts` | content describes production, and the site links to it | 1.6s | [screenshot](screenshots/07-docs-content-describes-production-and-the-site-links-to-it-test-finished-1.png) · [trace](traces/07-docs-content-describes-production-and-the-site-links-to-it.zip) |
| ✅ | `07-docs.spec.ts` | the old docs host redirects into /docs (production only) | 1.1s | [screenshot](screenshots/07-docs-the-old-docs-host-redirects-into-docs-production-only-test-finished-1.png) · [trace](traces/07-docs-the-old-docs-host-redirects-into-docs-production-only.zip) |
| ✅ | `07-docs.spec.ts` | self-hosters find the operator docs | 1.7s | [screenshot](screenshots/07-docs-self-hosters-find-the-operator-docs-test-finished-1.png) · [trace](traces/07-docs-self-hosters-find-the-operator-docs.zip) |
| ⏭️ | `08-dev-sign-in.spec.ts` | one click signs in and lands in the app | 0.0s |  |
| ✅ | `08-dev-sign-in.spec.ts` | no button and no endpoint | 0.7s | [screenshot](screenshots/08-dev-sign-in-no-button-and-no-endpoint-test-finished-1.png) · [trace](traces/08-dev-sign-in-no-button-and-no-endpoint.zip) |
