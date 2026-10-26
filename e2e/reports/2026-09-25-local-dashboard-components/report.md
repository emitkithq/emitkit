# EmitKit E2E report — local-dashboard-components, 2026-09-25

- Target: **local-dashboard-components**
- Commit: `9644987`
- Started: 2026-09-25T13:59:45.843Z · duration 30s
- Result: **7 passed, 0 failed, 0 skipped**

Reproduce: `E2E_TARGET=local-dashboard-components pnpm e2e && E2E_TARGET=local-dashboard-components pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `04-dashboard.spec.ts` | getting started: workspace, starter key, first event | 7.1s | [screenshot](screenshots/04-dashboard-getting-started-workspace-starter-key-first-event-test-finished-1.png) · [trace](traces/04-dashboard-getting-started-workspace-starter-key-first-event.zip) |
| ✅ | `04-dashboard.spec.ts` | events feed: live updates, pulse, search, channel, details, delete | 7.8s | [screenshot](screenshots/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete-test-finished-1.png) · [trace](traces/04-dashboard-events-feed-live-updates-pulse-search-channel-details-delete.zip) |
| ✅ | `04-dashboard.spec.ts` | API keys: create, rotate, revoke | 2.6s | [screenshot](screenshots/04-dashboard-api-keys-create-rotate-revoke-test-finished-1.png) · [trace](traces/04-dashboard-api-keys-create-rotate-revoke.zip) |
| ✅ | `04-dashboard.spec.ts` | settings: a modal over the current page; old addresses redirect | 3.0s | [screenshot](screenshots/04-dashboard-settings-a-modal-over-the-current-page-old-addresses-redirect-test-finished-1.png) · [trace](traces/04-dashboard-settings-a-modal-over-the-current-page-old-addresses-redirect.zip) |
| ✅ | `04-dashboard.spec.ts` | members: invite and cancel | 1.8s | [screenshot](screenshots/04-dashboard-members-invite-and-cancel-test-finished-1.png) · [trace](traces/04-dashboard-members-invite-and-cancel.zip) |
| ✅ | `04-dashboard.spec.ts` | members: an unverified invitee is asked to verify before accepting | 2.7s | [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-1.png) · [screenshot](screenshots/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting-test-finished-2.png) · [trace](traces/04-dashboard-members-an-unverified-invitee-is-asked-to-verify-before-accepting.zip) |
| ✅ | `04-dashboard.spec.ts` | organization switcher keeps workspaces apart | 2.3s | [screenshot](screenshots/04-dashboard-organization-switcher-keeps-workspaces-apart-test-finished-1.png) · [trace](traces/04-dashboard-organization-switcher-keeps-workspaces-apart.zip) |
