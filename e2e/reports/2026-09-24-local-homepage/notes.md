# Notes: homepage redesign (local production bundle)

This report comes from the change that rebuilds the marketing homepage on the brand kit. It also maps the kit palette onto HeroUI's tokens in `web/ui/styles.css`. `09-homepage.spec.ts` is new and lists the ways the page can break at the top of the file. It ran against the **built** bundle, not `vite dev`, because two of its tests read the prerendered HTML: under `vite dev` they skip, and the other three pass.

The run used the working tree on top of `4d6b69e`; the change was not committed yet, which is why the report shows that commit.

## Reproduce

The generated line in `report.md` (`E2E_TARGET=local-homepage pnpm e2e`) does not work: `local-homepage` only names this report. Run these instead:

```bash
pnpm db:seed:local && pnpm dev                     # app host, for the "Get started" origin
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state
E2E_SITE_URL=http://localhost:8788 E2E_APP_URL=http://app.localhost:5173 \
  E2E_API_URL=http://api.localhost:5173 E2E_ORIGIN=http://app.localhost:5173 \
  pnpm exec playwright test e2e/scenarios/09-homepage.spec.ts
E2E_TARGET=local-homepage pnpm e2e:report          # names the report directory only
```

`E2E_APP_URL` must match the `emitkit:app-url` the Worker injects: the `APP_URL` from `wrangler.jsonc`, or from `.dev.vars` when set there. This run used port 5183, because another workspace held 5173.

## What ran

All 5 tests passed:

- The served `/` is prerendered and 65 KB. It contains the headline, the hero `<picture>` (AVIF and WebP), every section anchor, and FAQPage structured data built from the same list as the accordion.
- In Chrome, `/` renders and hydrates with no console errors and no failed requests. "Get started" points at the announced app host. The cURL / TypeScript / MCP tabs switch, and the FAQ opens. After scrolling to the bottom, every image has loaded: the hero screenshot, three photographs and the ping patterns.
- With JavaScript off, every heading and paragraph is fully opaque once scrolled into view. The fade-ups use CSS scroll-driven animation, not script.
- With `prefers-reduced-motion`, the hero's push notification is shown straight away, with no entrance delay.
- At 390 px wide, the page does not scroll sideways.

Also run in this change, not recorded in this report: `09-homepage` against `vite dev` (3 passed, 2 skipped by design), `01-routing` against the bundle (4 passed, 1 production-only skip) and `08-dev-sign-in` locally (passed).

## Checked by hand

- Dashboard, sign-in, privacy and 404 pages after the token change: Mist background, Ink text, Emit Blue accent, and the wordmark now Midnight (`#050606`) as the kit specifies. No layout changes.
- The hero screenshot is a real capture of the seeded workspace, taken with `scripts/capture-dashboard-shot.ts`.
