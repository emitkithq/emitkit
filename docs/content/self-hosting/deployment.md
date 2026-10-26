---
title: "Deployment"
description: "Deploy on every push with Workers Builds or from a laptop, and where Alchemy keeps its state."
---

Alchemy provisions and updates everything in `alchemy.run.ts`, in the Cloudflare account set by `CLOUDFLARE_ACCOUNT_ID`. The examples use `example.com`; the Worker is named `emitkit` unless you set `EMITKIT_WORKER_NAME`.

## Deploy

With Workers Builds connected (below), merging to `main` deploys: Cloudflare builds the commit and runs `pnpm deploy:ci`. The build status shows up as a check on the commit, and logs are under Workers → emitkit → Deployments → Builds.

From a laptop, the same deploy is:

```bash
pnpm verify                  # lint, typecheck, build
pnpm release                 # state check + alchemy deploy --stage prod --env-file .env.local
```

A deploy is idempotent. It applies pending D1 migrations, uploads changed assets, updates the Worker script and bindings, and reconciles custom domains, the queue consumer and the cron trigger. Output:

```
{ api: 'https://api.example.com', app: 'https://app.example.com', worker: 'emitkit' }
```

With `EMITKIT_SITE_HOST` set, the output also lists `site`.

## State

Alchemy's state lives in your Cloudflare account, in the `alchemy-state-store` Worker (`Cloudflare.state()` in `alchemy.run.ts`). It holds the resource ids and the generated `BETTER_AUTH_SECRET` and VAPID key, so every machine and every build sees the same deployment and there is nothing to back up locally. The first deploy creates the store.

Every later deploy runs `pnpm state:check` first. It fails unless the store holds the `EmitKit/prod` stack with its generated secrets, because deploying without them would create new ones: everyone signed out, every push subscription broken (see [Recovery](/self-hosting/recovery)).

### Moving from a local `.alchemy/` directory

Installs deployed before the state store kept their state in a local `.alchemy/` directory. Copy that directory into the root of an up-to-date checkout, then move it once:

```bash
pnpm exec alchemy provider cloudflare bootstrap --env-file .env.local   # deploy the state store
pnpm state:migrate --env-file .env.local                                # copy EmitKit/prod into it
pnpm state:check --env-file .env.local
```

`state:migrate` refuses to run when `./.alchemy` lacks the prod stack, or when the remote store already has one (`--force` overwrites). Keep the old `.alchemy/` until the first deploy from the new store shows no changes to the Worker, D1 or secrets.

## Workers Builds

Workers Builds is Cloudflare's Git integration: a GitHub or GitLab app that builds and deploys on push. Connect it once your state is in the store, in the dashboard under Workers → emitkit → Settings → Builds → Connect:

| Setting | Value |
| --- | --- |
| Repository | your EmitKit repository, production branch `main` |
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:ci` |
| Non-production branch builds | on, version command `pnpm ci:check` (lint, typecheck and a state check: proves the token reaches the state store before `main` deploys) |
| Build variables | `CLOUDFLARE_ACCOUNT_ID`, `PNPM_VERSION=12.4.1`, `EMITKIT_DOMAIN`, plus any other `EMITKIT_*` settings from [Configuration](/self-hosting/configuration) (and `DOCS_SITE_URL` with a site host) |
| Build secrets | `EMITKIT_DEPLOY_TOKEN`: the deploy token |

Leave the build token (API token) on Cloudflare's generated one: it only starts the build. It covers Workers, KV and R2, which is not enough for this stack, so `pnpm ci:check` and `pnpm deploy:ci` hand `EMITKIT_DEPLOY_TOKEN` to Alchemy as `CLOUDFLARE_API_TOKEN`. Don't name the build secret `CLOUDFLARE_API_TOKEN`: Workers Builds then uses it as the build token and fails with "The build token selected for this build has been deleted or rolled". The build image defaults to pnpm 10, so `PNPM_VERSION` pins the version from `packageManager`.

Do not set the version command to `wrangler preview` or switch to Worker Previews: `wrangler.jsonc` names the production queue and dataset, so a branch preview would write into production.

### Worker Previews

Cloudflare Worker Previews (`wrangler preview`) do not fit this Worker yet:

- The router picks the surface by exact hostname (`API_URL`, `APP_URL`, `SITE_URL`); a Preview gets one hostname, so only the marketing site would load.
- Better Auth needs the app origin at deploy time; preview hostnames change per branch.
- Queue consumers cannot target a Preview and cron stays on production, so ingestion only completes with `EVENT_STORE=d1` and a preview D1.
- Alchemy does not manage Previews, and the custom domains it manages have no `previews_enabled`.

## Staging on the same stack

Point the hostnames elsewhere to try a build without touching production hosts:

```bash
EMITKIT_APP_HOST=staging-app.example.com EMITKIT_API_HOST=staging-api.example.com \
pnpm exec alchemy deploy --stage prod --env-file .env.local --yes
```

With a site, add `EMITKIT_SITE_HOST=staging.example.com EMITKIT_REDIRECT_HOSTS="" EMITKIT_DOCS_HOST=""`.

This reuses the same Worker, D1 and dataset: it is the same deployment under other names. Deploy again without the overrides to move back. Use a different `--stage` plus `EMITKIT_WORKER_NAME` for an isolated copy.

## Verify after deploying

```bash
curl -s https://api.example.com/health
pnpm exec wrangler tail emitkit        # live logs (Workers observability is enabled)
```

The repository's end-to-end suite runs against production with `pnpm e2e:prod`; see `e2e/README.md` for pointing it at your hosts.

## Custom domains and DNS

Each hostname is a Workers custom domain. Cloudflare manages the DNS record and certificate. A hostname that already has an A/AAAA/CNAME record managed elsewhere is refused: delete that record in the dashboard (DNS → Records) first.
