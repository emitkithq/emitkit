# EmitKit E2E report — local, 2026-09-26

- Target: **local**
- Commit: `48e8421`
- Started: 2026-09-26T12:43:44.212Z · duration 16s
- Result: **3 passed, 0 failed, 0 skipped**

Reproduce: `E2E_TARGET=local pnpm e2e && E2E_TARGET=local pnpm e2e:report` (see e2e/README.md).
Open a trace with `pnpm exec playwright show-trace <file>`. Traces are redacted:
API keys, cookies, tokens and the test password are replaced by `[REDACTED]`.

| | Scenario | Test | Time | Evidence |
| --- | --- | --- | --- | --- |
| ✅ | `17-brand.spec.ts` | a work address brands the organization and picks its recipes | 4.9s | [screenshot](screenshots/17-brand-a-work-address-brands-the-organization-and-picks-its-recipes-test-finished-1.png) · [http log](logs/17-brand-a-work-address-brands-the-organization-and-picks-its-recipes.json) · [trace](traces/17-brand-a-work-address-brands-the-organization-and-picks-its-recipes.zip) |
| ✅ | `17-brand.spec.ts` | the owner corrects the brand with their website, or picks by hand | 5.0s | [screenshot](screenshots/17-brand-the-owner-corrects-the-brand-with-their-website-or-picks-by-hand-test-finished-1.png) · [screenshot](screenshots/17-brand-the-owner-corrects-the-brand-with-their-website-or-picks-by-hand-test-finished-2.png) · [http log](logs/17-brand-the-owner-corrects-the-brand-with-their-website-or-picks-by-hand.json) · [trace](traces/17-brand-the-owner-corrects-the-brand-with-their-website-or-picks-by-hand.zip) |
| ✅ | `17-brand.spec.ts` | a mailbox address is never looked up | 3.3s | [screenshot](screenshots/17-brand-a-mailbox-address-is-never-looked-up-test-finished-3.png) · [screenshot](screenshots/17-brand-a-mailbox-address-is-never-looked-up-test-finished-1.png) · [screenshot](screenshots/17-brand-a-mailbox-address-is-never-looked-up-test-finished-2.png) · [http log](logs/17-brand-a-mailbox-address-is-never-looked-up.json) · [trace](traces/17-brand-a-mailbox-address-is-never-looked-up.zip) |
