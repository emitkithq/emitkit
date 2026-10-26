---
title: "Recovery"
description: "What holds state, how to back it up, and how to roll back or recover a broken deploy."
---

## What holds state

| Store | Holds | Backup / restore |
| --- | --- | --- |
| D1 `emitkit-db` | users, sessions, orgs, API keys, projects, channels, identities, push subscriptions, 25-hour event buffer | Time Travel: any minute in the last 30 days (Paid plan) |
| Analytics Engine `emitkit_events` | events, ~90 days | Not restorable; export with the SQL API if you need a copy |
| Alchemy state (`alchemy-state-store` Worker in the account) | resource ids, generated `BETTER_AUTH_SECRET` and VAPID key | Lives in Cloudflare; `pnpm exec alchemy state read -r EmitKit/prod` shows it |
| `.env.local` (local, gitignored) and the Workers Builds secret | deploy token | Recreate the token in the dashboard |

## Common procedures

**Roll back code**: check out the last good commit, then `pnpm release`. Migrations are forward-only. If a migration broke something, write a new one that fixes it instead of editing the applied file.

**Restore D1 to a point in time**

```bash
pnpm exec wrangler d1 time-travel info emitkit-db
pnpm exec wrangler d1 time-travel restore emitkit-db --timestamp=2026-09-24T10:00:00Z
```

**Export D1**: `pnpm exec wrangler d1 export emitkit-db --remote --output=backup.sql`

**Lost Alchemy state** (the state-store Worker or its Secrets Store was deleted): `pnpm state:check` fails and deploys stop. Run `pnpm exec alchemy deploy --stage prod --env-file .env.local --adopt`. Alchemy re-adopts the existing Worker, D1, queue and domains by name. The generated secrets can't be recovered, so new ones are created:

- a new `BETTER_AUTH_SECRET` signs everyone out;
- a new VAPID key stops existing push subscriptions: users re-enable notifications once in Settings → Notifications;
- the old analytics token (`emitkit-analytics-read`) stays in the account; delete it in the dashboard.

**Rotate secrets**: delete the matching `Random` entry (`pnpm exec alchemy state delete EmitKit/prod/BetterAuthSecret`, or `VapidPrivateKey`), or change its id in `alchemy.run.ts`, then deploy. The consequences are the same as above.

**Rotate the deploy token**: create a new token, update `.env.local` and the `CLOUDFLARE_API_TOKEN` build secret, delete the old token. Nothing else changes.

**Custom domain stuck / DNS conflict**: the hostname has a record managed outside the Worker. Delete that record in the dashboard (DNS → Records), then deploy again.

**Everything is down**: `pnpm exec wrangler tail emitkit` shows startup failures. A `ConfigError` means a variable or secret is missing or malformed. A `SCHEMA_MISMATCH` means a migration hasn't been applied (deploy again). Previous Worker versions are listed under Workers → emitkit → Deployments and can be rolled back from there as a stopgap.
