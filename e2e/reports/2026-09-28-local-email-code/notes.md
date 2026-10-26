# Notes: emailed sign-in codes instead of magic links (local, `pnpm dev`)

This change swaps Better Auth's `magicLink` plugin for `emailOTP`. On iPhone, a magic link tapped in Mail opens in Safari. Safari keeps its own cookies, separate from the Home Screen app, so that app stayed signed out. A code is typed into the app itself.

It also fixes a bug that affected every sign-in method. A signed-out visitor opened a deep link (`/<org>/channels`, or a notification's URL) and signed in. Sign-in then bounced between the page and `/auth/sign-in` until the router gave up with "Too many redirects". The "signed out" session cached before sign-in outlived it: the `$org` guard trusted it, and sign-in's guest check fetched a fresh session and sent the visitor back. `requireSession` now asks the server again before redirecting.

The working tree sat on top of `97950a6` and was not committed yet, which is why the report shows that commit.

## Reproduce

```bash
pnpm db:migrate:local
PORT=55100 pnpm dev
PORT=55100 E2E_TARGET=local pnpm e2e
E2E_TARGET=local-email-code pnpm e2e:report   # names the report directory only
```

`21-email-code.spec.ts` reads each code from the mail the local Worker writes to `web/.wrangler/tmp/email/*/email-text/`, so it runs under `pnpm dev` only and skips elsewhere. Better Auth allows three code requests and three code sign-ins a minute from one address. The scenario waits out a 429 once, so a full run spends about two minutes in it.

## What ran

99 passed, 0 failed. The 38 skips are by design: site, staging and production-only checks, billing-on checks, and brand lookups without `CONTEXT_DEV_API_KEY`.

- `21-email-code`, new. The top of the file lists how the change could break.
  - An existing, verified account opens `/<org>/channels` signed out and lands on sign-in with `redirectTo`. It follows **Continue with Email Code**, asks for a code and enters it, and lands on the Channels page.
  - A second request for the same address sends the same code (`resendStrategy: "reuse"`).
  - The account's password still works afterwards.
  - A new address creates an account by code: it leaves `/auth` and gets a session with `emailVerified: true`. The test deletes its organization and user.
  - Three wrong codes return 400. The right code after that returns 403 `TOO_MANY_ATTEMPTS`, no session is created, and a new request sends a different code.
- `03-auth` gains a deep-link check. A fresh browser context opens the workspace's `/channels` signed out, signs in with a password, and lands on Channels at that URL. Before the fix this ended on "Too many redirects". The code-request check now uses `/auth/email-otp` and the **Send code** button, and waits for "We sent a code to …".
- `13-signed-in` checks `email-otp` in place of `magic-link` among the guest-only pages that send a signed-in visitor on.

Checked by hand:

- The code email has the heading "Sign in to EmitKit", one sentence and the six digits, with no button. The text part reads `Your code: 123456`.
- In the verification table the stored code is encrypted, not the plain digits.
- `pnpm db:auth-schema` prints the same DDL as before, so there is no migration.
- The code input renders with `autocomplete="one-time-code"` and `inputmode="numeric"` (input-otp through HeroUI's `InputOTP`). iOS can offer the code from Mail above the keyboard. Not tried on a device yet.

## Not covered here

- **Sign-up turned off** (`allowSignup` false): an unknown address should be refused. `disableSignUp: !settings.allowSignup` mirrors the old magic-link setting, but no run used that configuration.
- **Unverified password accounts.** If someone signs up with a password, never verifies, then signs in by code, Better Auth removes the password and other sessions before marking the address verified (`revokeUnprovenAccountAccess`). Magic links did the same. This is Better Auth's defence against someone else registering the address first, not a regression.
- **Real inbox and a real iPhone.** Staging and production send the code to the `hi+emitkit-e2e` mailbox. Check delivery there, and check the Home Screen app flow on a device.

## Flakes seen along the way (not caused by this change)

- `17-brand` "the owner corrects the brand…" failed in three of six full runs. Its `signUp` helper posts `/api/auth/sign-up/email` without `postAuth`'s 429 retry, and earlier scenarios use up Better Auth's three sign-ups per 10 seconds. Run on its own, the sign-ups return 200.
- After about 40 minutes and several full runs, one `vite dev` process began logging "Cannot perform I/O on behalf of a different request" from D1's tracing helper on `get-session`. Dashboard feeds then stalled, and `19-actions` "the feed shows questions…" failed with this change's session guard and with the original. A fresh `pnpm dev` logged none of these errors, and the recorded run passed.
