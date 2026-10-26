# EmitKit E2E report — local, 2026-09-26

- Target: **local**
- Commit: `9dd5ba8`
- Started: 2026-09-26T09:43:53.316Z · duration 24s
- Result: **29 passed, 0 failed, 3 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
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
| ✅ | `03-auth.spec.ts` | sign up, create a workspace, sign out, sign back in | 1.8s | [screenshot](screenshots/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in-test-finished-1.png) · [trace](traces/03-auth-sign-up-create-a-workspace-sign-out-sign-back-in.zip) |
| ✅ | `03-auth.spec.ts` | password reset and magic link requests are accepted | 0.5s | [screenshot](screenshots/03-auth-password-reset-and-magic-link-requests-are-accepted-test-finished-1.png) · [trace](traces/03-auth-password-reset-and-magic-link-requests-are-accepted.zip) |
| ✅ | `07-docs.spec.ts` | docs home and a guide render with their assets | 0.8s | [screenshot](screenshots/07-docs-docs-home-and-a-guide-render-with-their-assets-test-finished-1.png) · [trace](traces/07-docs-docs-home-and-a-guide-render-with-their-assets.zip) |
| ✅ | `07-docs.spec.ts` | links and assets stay under /docs | 0.0s | [trace](traces/07-docs-links-and-assets-stay-under-docs.zip) |
| ✅ | `07-docs.spec.ts` | API reference covers every operation in the published contract | 0.0s | [trace](traces/07-docs-api-reference-covers-every-operation-in-the-published-contract.zip) |
| ✅ | `07-docs.spec.ts` | search, sitemap and agent files | 0.0s | [trace](traces/07-docs-search-sitemap-and-agent-files.zip) |
| ✅ | `07-docs.spec.ts` | unknown pages get the docs 404, old paths redirect | 0.2s | [screenshot](screenshots/07-docs-unknown-pages-get-the-docs-404-old-paths-redirect-test-finished-1.png) · [trace](traces/07-docs-unknown-pages-get-the-docs-404-old-paths-redirect.zip) |
| ✅ | `07-docs.spec.ts` | content describes production, and the site links to it | 0.5s | [screenshot](screenshots/07-docs-content-describes-production-and-the-site-links-to-it-test-finished-1.png) · [trace](traces/07-docs-content-describes-production-and-the-site-links-to-it.zip) |
| ⏭️ | `07-docs.spec.ts` | the old docs host redirects into /docs (production only) | 0.1s | [screenshot](screenshots/07-docs-the-old-docs-host-redirects-into-docs-production-only-test-finished-1.png) · [trace](traces/07-docs-the-old-docs-host-redirects-into-docs-production-only.zip) |
| ✅ | `07-docs.spec.ts` | self-hosters find the operator docs | 0.5s | [screenshot](screenshots/07-docs-self-hosters-find-the-operator-docs-test-finished-1.png) · [trace](traces/07-docs-self-hosters-find-the-operator-docs.zip) |
| ✅ | `09-homepage.spec.ts` | the served document is prerendered and light | 0.0s | [trace](traces/09-homepage-the-served-document-is-prerendered-and-light.zip) |
| ✅ | `09-homepage.spec.ts` | renders, hydrates and loads every image | 3.5s | [screenshot](screenshots/09-homepage-renders-hydrates-and-loads-every-image-test-finished-1.png) · [trace](traces/09-homepage-renders-hydrates-and-loads-every-image.zip) |
| ✅ | `09-homepage.spec.ts` | a demo that fails to load leaves the page standing | 1.5s | [screenshot](screenshots/09-homepage-a-demo-that-fails-to-load-leaves-the-page-standing-test-finished-1.png) · [trace](traces/09-homepage-a-demo-that-fails-to-load-leaves-the-page-standing.zip) |
| ✅ | `09-homepage.spec.ts` | content never waits for JavaScript or motion | 1.7s | [screenshot](screenshots/09-homepage-content-never-waits-for-javascript-or-motion-test-finished-1.png) · [trace](traces/09-homepage-content-never-waits-for-javascript-or-motion.zip) |
| ✅ | `09-homepage.spec.ts` | reduced motion shows the push notification at once | 0.4s | [screenshot](screenshots/09-homepage-reduced-motion-shows-the-push-notification-at-once-test-finished-1.png) · [trace](traces/09-homepage-reduced-motion-shows-the-push-notification-at-once.zip) |
| ✅ | `09-homepage.spec.ts` | pricing: periods outside, Solo or Team inside the card | 0.5s | [screenshot](screenshots/09-homepage-pricing-periods-outside-solo-or-team-inside-the-card-test-finished-1.png) · [trace](traces/09-homepage-pricing-periods-outside-solo-or-team-inside-the-card.zip) |
| ✅ | `09-homepage.spec.ts` | fits a phone without sideways scrolling | 2.5s | [screenshot](screenshots/09-homepage-fits-a-phone-without-sideways-scrolling-test-finished-1.png) · [trace](traces/09-homepage-fits-a-phone-without-sideways-scrolling.zip) |
| ✅ | `13-signed-in.spec.ts` | sign-in and sign-up send a signed-in visitor on | 1.4s | [screenshot](screenshots/13-signed-in-sign-in-and-sign-up-send-a-signed-in-visitor-on-test-finished-1.png) · [trace](traces/13-signed-in-sign-in-and-sign-up-send-a-signed-in-visitor-on.zip) |
| ✅ | `13-signed-in.spec.ts` | re-authentication still shows the form | 0.1s | [screenshot](screenshots/13-signed-in-re-authentication-still-shows-the-form-test-finished-1.png) · [trace](traces/13-signed-in-re-authentication-still-shows-the-form.zip) |
| ✅ | `13-signed-in.spec.ts` | a failed session check leaves sign-in reachable | 0.4s | [screenshot](screenshots/13-signed-in-a-failed-session-check-leaves-sign-in-reachable-test-finished-1.png) · [screenshot](screenshots/13-signed-in-a-failed-session-check-leaves-sign-in-reachable-test-finished-2.png) · [trace](traces/13-signed-in-a-failed-session-check-leaves-sign-in-reachable.zip) |
| ✅ | `13-signed-in.spec.ts` | the hint cookie follows the session | 0.1s | [screenshot](screenshots/13-signed-in-the-hint-cookie-follows-the-session-test-finished-1.png) · [trace](traces/13-signed-in-the-hint-cookie-follows-the-session.zip) |
| ✅ | `13-signed-in.spec.ts` | the first paint already shows Dashboard | 0.3s | [screenshot](screenshots/13-signed-in-the-first-paint-already-shows-dashboard-first-paint-signed-in-header-4d97fdcace4ca40a5aa0d6149e7157d20b4d6211.png) · [screenshot](screenshots/13-signed-in-the-first-paint-already-shows-dashboard-test-finished-1.png) · [trace](traces/13-signed-in-the-first-paint-already-shows-dashboard.zip) |
| ✅ | `13-signed-in.spec.ts` | the site header offers the dashboard, and nothing moves | 2.4s | [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-hydrated-signed-in-header-48e773a81927308a56f26a1713b8ac65fa018aa2.png) · [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-test-finished-1.png) · [screenshot](screenshots/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves-test-finished-2.png) · [trace](traces/13-signed-in-the-site-header-offers-the-dashboard-and-nothing-moves.zip) |
| ✅ | `13-signed-in.spec.ts` | after sign-out the site offers Sign in again | 0.3s | [screenshot](screenshots/13-signed-in-after-sign-out-the-site-offers-sign-in-again-test-finished-1.png) · [trace](traces/13-signed-in-after-sign-out-the-site-offers-sign-in-again.zip) |
| ⏭️ | `13-signed-in.spec.ts` | without a shared domain the site keeps Sign in | 0.1s | [screenshot](screenshots/13-signed-in-without-a-shared-domain-the-site-keeps-sign-in-test-finished-1.png) · [trace](traces/13-signed-in-without-a-shared-domain-the-site-keeps-sign-in.zip) |
| ✅ | `13-signed-in.spec.ts` | sign-out lands on sign-in and stays there | 1.3s | [screenshot](screenshots/13-signed-in-sign-out-lands-on-sign-in-and-stays-there-test-finished-1.png) · [trace](traces/13-signed-in-sign-out-lands-on-sign-in-and-stays-there.zip) |
