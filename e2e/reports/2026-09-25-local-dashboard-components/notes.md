# Notes: dashboard components shared with the homepage (local dev)

This run is the regression check for the dashboard after its event components were split so the homepage hero can run them on made-up data:

- `EventFeed` and `EventDetails` no longer import the router. The dashboard passes the channel link in (`channelLink`, built from TanStack Router's `Link` in `events-screen.tsx`). `onDelete` and `onLoadMore` are optional; without `onDelete` there is no Delete button. The new `embedded` mode (sticky day labels at the top of their own scroll box, no page scrolling) and `initialOpenId` are only used by the homepage.
- The empty feed's "send your first event" help moved to `empty-feed.tsx`, because it links to settings and builds API snippets.
- `PulseCard` fetches and renders `PulseView`, which only takes data.
- `EventFeed` and `EventDetails` take an optional `actions` component, drawn above an unfolded event's details. The dashboard passes none yet; the homepage demo uses it to preview answering an event that asks a question, ahead of the actions API.
- Organizations with a `logo` show it as their avatar in the header and the organization switcher. The seeded workspace is now "EmitKit" (`/emitkit`) with the app icon as its logo.

The change was not committed when this ran, so the report shows the base commit on `main`.

## Reproduce

`local-dashboard-components` only names this report directory. It is not a target preset. The run used a second dev server on port 5183, with a migrated and seeded local D1 and a `.dev.vars` holding `BETTER_AUTH_SECRET` and a VAPID key pair (see the development guide).

```bash
pnpm db:migrate:local && pnpm db:seed:local
PORT=5183 pnpm exec vite dev --port 5183 --strictPort
E2E_SITE_URL=http://localhost:5183 E2E_APP_URL=http://app.localhost:5183 \
  E2E_API_URL=http://api.localhost:5183 E2E_ORIGIN=http://app.localhost:5183 \
  pnpm exec playwright test e2e/scenarios/04-dashboard.spec.ts
E2E_TARGET=local-dashboard-components pnpm e2e:report
```

## What ran

All 7 tests passed, unchanged, after both the split and the `actions` slot. They cover getting started, and the feed's live updates, pulse, search, channel filter, unfolded details and delete. They also cover API keys, settings, members, and the organization switcher, which now draws a logo avatar.
