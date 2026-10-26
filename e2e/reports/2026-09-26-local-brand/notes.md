# Paywall brand and recipes (local, 2026-09-26)

`report.md` covers `17-brand.spec.ts` against `pnpm dev` with billing on (an Autumn **sandbox** key) and a Context.dev key, both in the worktree's own `.dev.vars` (a copy, not the symlink to the main checkout).

## Rerun

```bash
# .dev.vars: AUTUMN_SECRET_KEY=am_sk_test_…  CONTEXT_DEV_API_KEY=ctxt_secret_…
pnpm db:migrate:local && pnpm dev
pnpm exec playwright test 17-brand
E2E_TARGET=local pnpm e2e:report   # then rename the folder
```

Each run spends about 30 Context.dev credits: linear.app twice (the work address of scenarios 1 and 2) and shopify.com once. Sign-ups on `@linear.app` and `@gmail.com` are safe locally because `pnpm dev` doesn't deliver mail.

## What the scenarios show

- `…work-address…`: an owner at `linear.app` opens the paywall. The organization is renamed "Linear" and takes Linear's square icon in the header (the slug is unchanged). The panel shows "Software (B2B)", "The pings a SaaS actually wants.", four compact example pushes and the "Not a log drain" line. A second organization the same owner creates ("Side project") is not looked up by email domain: `status: "none"`, no icon, and the website field is offered.
- `…corrects-the-brand…`: `localhost` is refused before any lookup. `https://www.shopify.com/` is looked up as `shopify.com`, which replaces Linear (name, icon, recipes). Picking "Fintech" switches the examples, and Shopify's name and icon stay visible.
- `…mailbox-address…`: a `gmail.com` owner is never looked up. Their organization keeps "E2E's workspace", and the paywall shows the SaaS set with "What do you build?".

## Checked by hand

Screenshots added to `screenshots/` next to the generated ones:

- `picker-desktop.png`: the correction popover over a `stripe.com` brand ("Payments & Money Movement" → fintech): the website field, then the kinds of business.
- `paywall-mobile.png`: 390 px. The panel shows the brand and two of the four pushes. The plans follow below, and "Start free trial" stays pinned at the bottom.
- `picker-no-key.png`: the server restarted without `CONTEXT_DEV_API_KEY`. Nothing is looked up: the organization keeps "Ada's workspace", the popover has no website field, and scenarios 1 and 2 skip while 3 passes.

Other checks:

- Two simultaneous `workspace.brand` calls for a new organization both answer the same brand. `on conflict` keeps one row, but both calls are billed.
- The homepage still prerenders its push cards after `PushCard` moved to `web/ui` (`pnpm build`, `dist/client/www/index.html`). Under `pnpm dev`, the site answered 504 for `@number-flow/react` (Vite's "outdated optimized dependency" after restarts), unrelated to this change.
- `example.com` (the domain other local scenarios sign up with) is reserved and never looked up. Before that fix, Context.dev returned an "Example" brand filed under agencies.
- An organization deleted while its lookup is still running logs `brand lookup failed … brand.found` (foreign key). It's harmless: the organization is gone.

## Not covered here

- The Stripe checkout step of `14-billing` fails against this sandbox. Autumn answers 400: "You must have a valid head office address to enable automatic tax calculation in test mode". That's a setting in the Stripe test dashboard and unrelated to this change. The paywall step of `14-billing` passes.
- `04-dashboard` expects billing off; with billing on its setup guide waits behind the paywall, as before this change.
- Production: brand lookups are off there until `EMITKIT_CONTEXT_DEV_API_KEY` is set at deploy.
