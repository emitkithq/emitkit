# EmitKit E2E report — local-signed-in, 2026-09-25

- Target: **local-signed-in**
- Commit: `3a1987a`
- Started: 2026-09-25T08:38:07.094Z · duration 20s
- Result: **20 passed, 0 failed, 2 skipped**

Reproduce: `E2E_TARGET=local-signed-in pnpm e2e && E2E_TARGET=local-signed-in pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `01-routing.spec.ts` | marketing site serves prerendered pages | 0.0s | [trace](traces/01-routing-marketing-site-serves-prerendered-pages.zip) |
| ✅ | `01-routing.spec.ts` | site assets and SEO files | 0.0s | [trace](traces/01-routing-site-assets-and-seo-files.zip) |
| ⏭️ | `01-routing.spec.ts` | www redirects to the apex (production only) | 0.0s | [trace](traces/01-routing-www-redirects-to-the-apex-production-only.zip) |
| ✅ | `01-routing.spec.ts` | app host serves the PWA shell, manifest and service worker | 0.0s | [trace](traces/01-routing-app-host-serves-the-pwa-shell-manifest-and-service-worker.zip) |
| ✅ | `01-routing.spec.ts` | api host serves health and the OpenAPI document | 0.0s | [trace](traces/01-routing-api-host-serves-health-and-the-openapi-document.zip) |
| ✅ | `03-auth.spec.ts` | signed-out visitors are sent to sign-in | 0.4s | [screenshot](screenshots/03-auth-signed-out-visitors-are-sent-to-sign-in-test-finished-1.png) · [trace](traces/03-auth-signed-out-visitors-are-sent-to-sign-in.zip) |
| ✅ | `03-auth.spec.ts` | sign up, create a workspace, sign out, sign back in | 1.2s | [screenshot](screenshots/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in-test-finished-1.png) · [trace](traces/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in.zip) |
| ✅ | `03-auth.spec.ts` | password reset and magic link requests are accepted | 0.5s | [screenshot](screenshots/03-auth-password-reset-and-magic-link-requests-are-accepted-test-finished-1.png) · [trace](traces/03-auth-password-reset-and-magic-link-requests-are-accepted.zip) |
| ✅ | `09-homepage.spec.ts` | the served document is prerendered and light | 0.0s | [trace](traces/09-homepage-the-served-document-is-prerendered-and-light.zip) |
| ✅ | `09-homepage.spec.ts` | renders, hydrates and loads every image | 1.9s | [screenshot](screenshots/09-homepage-renders-hydrates-and-loads-every-image-test-finished-1.png) · [trace](traces/09-homepage-renders-hydrates-and-loads-every-image.zip) |
| ✅ | `09-homepage.spec.ts` | content never waits for JavaScript or motion | 1.6s | [screenshot](screenshots/09-homepage-content-never-waits-for-javascript-or-motion-test-finished-1.png) · [trace](traces/09-homepage-content-never-waits-for-javascript-or-motion.zip) |
| ✅ | `09-homepage.spec.ts` | reduced motion shows the push notification at once | 0.4s | [screenshot](screenshots/09-homepage-reduced-motion-shows-the-push-notification-at-once-test-finished-1.png) · [trace](traces/09-homepage-reduced-motion-shows-the-push-notification-at-once.zip) |
| ✅ | `09-homepage.spec.ts` | fits a phone without sideways scrolling | 2.1s | [screenshot](screenshots/09-homepage-fits-a-phone-without-sideways-scrolling-test-finished-1.png) · [trace](traces/09-homepage-fits-a-phone-without-sideways-scrolling.zip) |
| ✅ | `13-signed-in.spec.ts` | sign-in and sign-up send a signed-in visitor on | 1.4s | [screenshot](screenshots/13-signed-in-sign-in-and-sign-up-send-a-signed-in-visitor-on-test-finished-1.png) · [trace](traces/13-signed-in-sign-in-and-sign-up-send-a-signed-in-visitor-on.zip) |
| ✅ | `13-signed-in.spec.ts` | re-authentication still shows the form | 0.1s | [screenshot](screenshots/13-signed-in-re-authentication-still-shows-the-form-test-finished-1.png) · [trace](traces/13-signed-in-re-authentication-still-shows-the-form.zip) |
| ✅ | `13-signed-in.spec.ts` | a failed session check leaves sign-in reachable | 0.3s | [screenshot](screenshots/13-signed-in-a-failed-session-check-leaves-sign-in-reachable-test-finished-1.png) · [screenshot](screenshots/13-signed-in-a-failed-session-check-leaves-sign-in-reachable-test-finished-2.png) · [trace](traces/13-signed-in-a-failed-session-check-leaves-sign-in-reachable.zip) |
| ✅ | `13-signed-in.spec.ts` | the hint cookie follows the session | 3.1s | [screenshot](screenshots/13-signed-in-the-hint-cookie-follows-the-session-test-finished-1.png) · [trace](traces/13-signed-in-the-hint-cookie-follows-the-session.zip) |
| ✅ | `13-signed-in.spec.ts` | the first paint already shows Dashboard | 0.3s | [screenshot](screenshots/13-signed-in-the-first-paint-already-shows-dashboard-first-paint-signed-in-header-7c4ebca7e90bcc7fa5b009f56da6f641d9f6c19f.png) · [screenshot](screenshots/13-signed-in-the-first-paint-already-shows-dashboard-test-finished-1.png) · [trace](traces/13-signed-in-the-first-paint-already-shows-dashboard.zip) |
| ✅ | `13-signed-in.spec.ts` | the site header offers the dashboard, and nothing moves | 2.3s | [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-hydrated-signed-in-header-2eb9defab81518ef673dd56c59b1e2420c8f4bb9.png) · [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-test-finished-1.png) · [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-test-finished-2.png) · [trace](traces/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves.zip) |
| ✅ | `13-signed-in.spec.ts` | after sign-out the site offers Sign in again | 0.3s | [screenshot](screenshots/13-signed-in-after-sign-out-the-site-offers-sign-in-again-test-finished-1.png) · [trace](traces/13-signed-in-after-sign-out-the-site-offers-sign-in-again.zip) |
| ⏭️ | `13-signed-in.spec.ts` | without a shared domain the site keeps Sign in | 0.1s | [screenshot](screenshots/13-signed-in-without-a-shared-domain-the-site-keeps-sign-in-test-finished-1.png) · [trace](traces/13-signed-in-without-a-shared-domain-the-site-keeps-sign-in.zip) |
| ✅ | `13-signed-in.spec.ts` | sign-out lands on sign-in and stays there | 1.3s | [screenshot](screenshots/13-signed-in-sign-out-lands-on-sign-in-and-stays-there-test-finished-1.png) · [trace](traces/13-signed-in-sign-out-lands-on-sign-in-and-stays-there.zip) |
