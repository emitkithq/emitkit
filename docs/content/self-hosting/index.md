---
title: "Self-hosting"
description: "Run EmitKit on your own Cloudflare account: requirements, first deploy and updates."
---

You need a Cloudflare account on the Workers Paid plan (Queues and the CPU used by password hashing need it) and a zone on Cloudflare DNS.

1. **Clone and install**

   ```bash
   git clone https://github.com/emitkithq/emitkit && cd emitkit
   pnpm install
   ```

2. **Create a deploy token** with the [permissions listed under Configuration](/self-hosting/configuration#deploy-token-permissions), scoped to your account and zone.

3. **Configure** `.env.local` (gitignored):

   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   EMITKIT_DOMAIN=example.com
   # optional: EMITKIT_APP_HOST, EMITKIT_API_HOST, EMITKIT_EVENT_STORE=d1,
   # EMITKIT_EMAIL_FROM, EMITKIT_ALLOW_SIGNUP=false ...
   ```

   EmitKit takes two hostnames in the zone, `app.example.com` (dashboard) and `api.example.com` (API), plus the `mail.example.com` sending subdomain. Nothing else in the zone is touched. The chosen hostnames must not already have A/AAAA/CNAME records (a wildcard record is fine).

4. **Deploy**

   ```bash
   pnpm build && pnpm exec alchemy deploy --stage prod --env-file .env.local --yes
   ```

   The first deploy creates Alchemy's state store (a Worker in your account), the D1 database (and migrates it), the Analytics Engine dataset, the queue and consumer, the Email Sending subdomain with its DNS records, a read-only Analytics token (unless `EMITKIT_EVENT_STORE=d1`), and the Worker with its custom domains and hourly cron. Later deploys use `pnpm release`, which refuses to run if that state has gone missing.

5. **Sign up** at `https://app.<domain>` and follow the getting-started flow. To close sign-ups afterwards, set `EMITKIT_ALLOW_SIGNUP=false` and deploy again.

## Variations

- **No Analytics Engine**: set `EMITKIT_EVENT_STORE=d1` to keep events in D1 for 90 days. The stack then mints no analytics token, so the deploy token doesn't need Account API Tokens Edit.
- **Different product name or several installs per account**: set `EMITKIT_WORKER_NAME` (and a different `--stage`) for each install.
- **No Workers AI**: set `EMITKIT_AI=false`. Emoji suggestions fall back to keyword matching.
- **Marketing site and docs**: emitkit.com's own pages are in the repository too. They are served only when `EMITKIT_SITE_HOST` is set, which also attaches `www.` and `docs.` redirects to it (see [Configuration](/self-hosting/configuration)). Without it, links to the docs point at emitkit.com.

## Updating

```bash
git pull && pnpm install && pnpm release
```

Migrations are applied on deploy. Read the [changelog](/changelog) and commit messages for anything that needs manual steps. [Deployment](/self-hosting/deployment) covers deploying on every push, and [Recovery](/self-hosting/recovery) covers backups and rollbacks.

## License

EmitKit is source-available under the [PolyForm Shield License 1.0.0](https://github.com/emitkithq/emitkit/blob/main/LICENSE). You can self-host it for free, for personal use or your company's internal use. You may not use it to provide a product or service that competes with EmitKit, paid or free. The `LICENSE` file is the authoritative text. For other uses, ask about a commercial license at [hi@emitkit.com](mailto:hi@emitkit.com).
