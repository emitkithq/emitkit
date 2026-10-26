# Manual evidence — production, 2026-09-24

## Production reset, `ca5b410` (evening)

`report.md` now covers `ca5b410`. Before that run, production was reset on the owner's instruction: the original deploy's local Alchemy state was lost, so D1 `emitkit-db` was deleted and the stack was redeployed with `--adopt` into the new Cloudflare state store (`alchemy-state-store`). The database, `BETTER_AUTH_SECRET`, VAPID key and analytics token are new; every earlier account and push subscription is gone. The Worker, queue, Email Sending subdomain and custom domains were adopted in place. The first suite run found `events/pulse` answering 500 (Analytics Engine rejects `IF(…, Double, 0)`), fixed in `ca5b410` and redeployed with `pnpm release`, whose state check passed. The manual email and queue checks below were not repeated.

The manual checks below were made during the `fe883d9` run (tag `mufippwg`). `report.md` was later regenerated for `bde7981`. The changes since then moved the public API and MCP onto Effect HTTP, added the docs at `/docs` (with `docs.emitkit.com` redirecting there), and corrected the OpenAPI descriptions; none of them touched email, auth, queue or cron code.

These are the checks the Playwright scenarios can't do themselves: reading mail, and watching the Worker's logs for the Queue consumer and the cron. The operator made them by hand against production on the day of the run. Test addresses are plus-addressed aliases of the operator's inbox (`…+emitkit-e2e-<run>-<role>@…`). Links and tokens from these emails are not recorded here.

## Email delivery (Cloudflare Email Sending, `noreply@mail.emitkit.com`)

Every message below arrived in the Gmail inbox (not spam) within a few seconds of the request, all from the run in `report.md` (run tag `mufippwg`).

| Email | Subject | Triggered by | Arrived (UTC) |
| --- | --- | --- | --- |
| Email verification (on sign-up) | Verify your EmitKit email | every sign-up, e.g. `04-dashboard` (12:39:02), `05-push-pwa` (12:40:07), `06-account-pwa` (12:40:43) | within 2 s of each sign-up |
| Password reset | Reset your EmitKit password | `03-auth` "password reset and magic link requests are accepted" | 12:38:56 |
| Magic link | Your EmitKit sign-in link | same test | 12:38:58 |
| Invitation | You're invited to E2E Dash Co on EmitKit | `04-dashboard` "members: invite and cancel" and "an unverified invitee is asked to verify" | 12:39:44, 12:39:50 |
| Verification resent from the invitation page | Verify your EmitKit email | `04-dashboard`, "Send verification email" on the "Verify your email first" screen | 12:39:56 |

## Links followed from the inbox

- **Magic link for a new address.** Requested at 12:06:16 UTC for an address with no account, then followed from the email. `verify` returned 302 to `https://app.emitkit.com/` with a session for the new address (`emailVerified: true`). The user was then deleted (`POST /api/auth/delete-user` 200; `get-session` afterwards: `null`).
- **Invitation, end to end, with an unverified invitee.**
  1. The inviter created the org "Invite Proof" and invited a fresh address. The email arrived at 12:05:37.
  2. The invitee signed up with email and password. `get-invitation` answered 403 `EMAIL_VERIFICATION_REQUIRED`; the PWA turns this into its "Verify your email first" screen, covered by `04-dashboard`.
  3. The verification email arrived at 12:05:39. Its link returned 302 to the app, and the invitee then showed `emailVerified: true`.
  4. `get-invitation` then showed `pending`, and `accept-invitation` returned 200.
  5. The org's members were `owner` (the inviter) and `member` (the invitee).
  6. Cleanup: the org was deleted (200) and both users were deleted (200).

## Queue consumer and cron (`wrangler tail emitkit --format json`, 12:21–12:28 UTC)

`05-push-pwa` was re-run alone inside the capture window. The same capture caught the hourly cron.

| Event (UTC) | Handler | Outcome | Log line |
| --- | --- | --- | --- |
| 12:21:47 | queue `emitkit-events` | ok | `push fan-out {"delivered":1,"eventId":"event_0ldk6y7a…"}` |
| 12:23:33 | scheduled `23 * * * *` | ok | `retention sweep {"apiKeys":67,"events":0,"identities":0,"idempotencyReceipts":0,"projects":0,"tombstones":0}` |

Cloudflare's GraphQL analytics (`workersInvocationsScheduled`) also show the `23 * * * *` trigger succeeding at 11:23:37. The sweep deletes API keys whose project no longer exists, and projects only disappear when their organization is deleted or a soft-deleted project is purged (none were purged in this run). The 67 keys therefore belonged to test organizations deleted by earlier E2E runs. See the second defect below: they are now deleted along with the organization.

## Defects found and fixed while verifying

`06-account-pwa` was written first and run against production, where it failed. The fixes went out in `0f43ff4` (first three rows) and `fe883d9` (last row), and the scenario passes in this report.

| Failure mode | Before (production probe) | After |
| --- | --- | --- |
| The only owner deletes their account | Organization and API key survived; `POST /v1/events` → **201** | Organization deleted with the account; key → **401** |
| An organization is deleted | Key row left in D1 until the hourly sweep; `POST /v1/events` → **403** | Keys deleted with the organization; key → **401** |
| An organization is re-slugged to a longer slug with the old one as prefix (`acme` → `acme-r`) | Dashboard loops between `/acme-r` and `/acme-r-r-r…`; the save toast arrives ~10 s late | Moves to `/acme-r/settings` once |
| A wrong password in "Delete account" | Settings crashed: `Invalid slot "errorMessage"` (react-aria-components 1.21 dialogs vs HeroUI `ErrorMessage`) | "Invalid password" shown in the dialog; the account, its organizations and its keys are untouched (201); patched in `patches/@heroui__react@3.2.6.patch` |

Better Auth checks the password before the deletion hook runs; a direct probe with a wrong password got 400 `INVALID_PASSWORD`, and the organization and its key survived. Account deletion is also refused while the account is the only owner of an organization that still has other members (Better Auth `BAD_REQUEST` with the reason). No scenario covers this, because it needs a second, email-verified member.

## Vercel decommission

The four replaced Vercel projects and the orphaned `*.emitkit.com` wildcard records were deleted after the previous full run passed. The run in `report.md` came after that cleanup, so it doubles as the re-verification of every hostname.
