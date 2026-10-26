# EmitKit E2E report — local-hero-dusk, 2026-09-24

- Target: **local-hero-dusk**
- Commit: `4d6b69e`
- Started: 2026-09-24T20:42:56.906Z · duration 7s
- Result: **5 passed, 0 failed, 0 skipped**

Reproduce: `E2E_TARGET=local-hero-dusk pnpm e2e && E2E_TARGET=local-hero-dusk pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `09-homepage.spec.ts` | the served document is prerendered and light | 0.0s | [trace](traces/09-homepage-the-served-document-is-prerendered-and-light.zip) |
| ✅ | `09-homepage.spec.ts` | renders, hydrates and loads every image | 2.2s | [screenshot](screenshots/09-homepage-renders-hydrates-and-loads-every-image-test-finished-1.png) · [trace](traces/09-homepage-renders-hydrates-and-loads-every-image.zip) |
| ✅ | `09-homepage.spec.ts` | content never waits for JavaScript or motion | 1.6s | [screenshot](screenshots/09-homepage-content-never-waits-for-javascript-or-motion-test-finished-1.png) · [trace](traces/09-homepage-content-never-waits-for-javascript-or-motion.zip) |
| ✅ | `09-homepage.spec.ts` | reduced motion shows the push notification at once | 0.4s | [screenshot](screenshots/09-homepage-reduced-motion-shows-the-push-notification-at-once-test-finished-1.png) · [trace](traces/09-homepage-reduced-motion-shows-the-push-notification-at-once.zip) |
| ✅ | `09-homepage.spec.ts` | fits a phone without sideways scrolling | 2.1s | [screenshot](screenshots/09-homepage-fits-a-phone-without-sideways-scrolling-test-finished-1.png) · [trace](traces/09-homepage-fits-a-phone-without-sideways-scrolling.zip) |
