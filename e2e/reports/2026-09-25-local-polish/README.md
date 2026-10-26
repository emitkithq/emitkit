# Dashboard polish: local E2E and before/after screens (2026-09-25)

The dashboard (`app.emitkit.com`, `web/app` + `web/ui`) after the polish on
branch `multiplehats/homepage-brand-redesign`: dark mode, a Channels screen,
the projects list, and a consistency pass. Everything here ran locally
against `pnpm dev` with the seeded database. No secrets, cookies or API keys
appear in any file. Traces are redacted by `pnpm e2e:report`.

- **E2E:** 50 passed, 0 failed, 14 skipped ([report.md](report.md)). The
  skipped tests are the docs scenarios (`pnpm dev` doesn't serve `/docs`),
  production-only checks, and checks that need a built bundle.
- **New scenarios:** `10-projects`, `11-channels`, `12-theme` (17 tests).
- **Screens:** 28 screens and states before (light only, since dark mode
  didn't exist), 33 after (the 28 plus the Channels screen, its dialog and
  three of its states), each at 1440 and 390 px, after in light and dark.
  Every 390 px shot is 390 px wide (before: `feed-long` was 784).
- **Punch list** with what was fixed, deferred and left to decide:
  [plan.md](plan.md).

## Rerun

```bash
pnpm install
pnpm db:migrate:local && pnpm db:seed:local
pnpm dev                                  # app on http://app.localhost:5173

# E2E (all scenarios; E2E_*_URL override the hosts if dev runs elsewhere)
pnpm e2e
pnpm e2e:report                           # writes e2e/reports/<date>-local/

# Screens (light + dark, 1440 + 390) into a folder of your choice
CAPTURE_OUT=/tmp/screens pnpm exec playwright test --config e2e/capture/playwright.config.ts
```

This run used port 5183: `pnpm dev --port 5183` with `.dev.vars` setting
`APP_URL`/`API_URL`/`SITE_URL` to `*.localhost:5183`, and
`E2E_APP_URL=http://app.localhost:5183` (plus `E2E_API_URL`, `E2E_SITE_URL`
and `E2E_ORIGIN`) for Playwright. The "before" screens came from a detached
worktree of `1d68380` (the commit before this work) on port 5184, captured by
the same script with `CAPTURE_THEMES=light`.

The capture signs in with "Continue in local dev" (the seeded Acme
workspace), signs up one throwaway user for the no-workspace, invitation,
empty and long-content states, and deletes that user, its workspace, the
invitation and the dev session when it finishes.

## Screens

`screens/before/light/<width>/` and `screens/after/<theme>/<width>/`, one file
per screen:

| Screen | File | Notes |
| --- | --- | --- |
| Sign in / sign up / reset | `auth-sign-in`, `auth-sign-up`, `auth-forgot-password` | White wordmark on dark |
| Wrong password | `auth-sign-in-wrong-password` | Was "Unauthorized"; now "Invalid email or password" |
| Getting started | `getting-started` | |
| Feed | `feed`, `feed-event-details` | Chevron switcher, clipped sparklines |
| Feed loading / error / no results | `feed-loading`, `feed-error`, `feed-no-results` | Skeleton rows; Button; "Clear search" |
| Empty workspace | `feed-empty` | No 0% chip or flat line; snippet fits at 390 |
| Long content | `feed-long`, `projects-long`, `channels-long` | No sideways scroll at 390 |
| Projects | `projects`, `projects-one`, `projects-empty`, `projects-error`, `project-dialog-create` | One list, row menu, Active/Deleted |
| Channels (new) | `channels`, `channels-empty`, `channels-no-projects`, `channel-dialog-create` | After only |
| Menus | `user-menu`, `command-palette` | Theme switch; Channels entry |
| Settings | `settings-members`, `settings-organization`, `settings-api-keys`, `settings-notifications`, `settings-account` | One card style; soft chips |
| Accept invitation | `accept-invitation`, `accept-invitation-missing` | No error toast |
| Not found | `not-found` | |

## Console errors during the capture

[`console-errors.txt`](console-errors.txt) lists every console error and
failed request in the after-capture (query strings stripped). All of them are
provoked on purpose or come from the environment:

- `500` on `/rpc/events/*` and `/rpc/projects/list`: the capture fakes server
  errors to shoot the error states.
- `401` on `/api/auth/sign-in/email`, and Better Auth UI's
  `Invalid email or password` log: the wrong-password shot. The log comes from
  Better Auth UI's own toaster (deferred, see plan.md).
- `400`/`403` on `/api/auth/organization/get-invitation`: the missing and
  unverified invitation shots, which the page now handles without a toast.
- `401` on `logo.parsew.com`: the local Parsew publishable key doesn't allow
  the `app.localhost` origin, so brand icons fall back to initials locally.
- Any `429` on `/api/auth/get-session`: Better Auth's rate limit (100 requests
  per 10 seconds per IP) under the capture's volume. The script pauses before
  its last groups to stay under it.

Nothing else: no page errors and no React warnings.
