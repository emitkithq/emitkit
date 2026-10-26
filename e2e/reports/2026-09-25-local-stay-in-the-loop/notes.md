# Notes: "Stay in the loop" homepage (local production bundle)

This run covers the homepage repositioning. Before, EmitKit read as "critical events from your stack". Now the story is "stay in the loop with your product", told through four reasons: stay in the loop, celebrate the small wins, keep a finger on the pulse, and critical errors reach you. The research behind it is in `docs/internal/positioning-research.md`. The hero's animated notification stack is replaced by a dashboard window with four tabs named for what they show: Live feed, Revenue, Agents and Errors. The window rises out of the photo's lower edge and hangs over the page below it, for depth. Each tab runs the real dashboard feed and pulse (`@app/features/events`) on made-up data. Three fictional products appear, and a new moment arrives every few seconds in the first tab. The demo is a lazily loaded chunk that renders after hydration, and the prerender shows a skeleton. The old hero is kept, unmounted, in `web/www/landing/hero-live-stack.tsx`. The same change swaps the hero photo from `dusk` to `halo` (the brand kit's `serenox-Image 30.png`) and regenerates `og-image.jpg` from the kit's SVG with the new tagline.

The change was not committed when this ran, so the report shows the base commit on `main`.

## Reproduce

`local-stay-in-the-loop` only names this report directory. It is not a target preset.

```bash
pnpm dev                                           # app host on 5173, for the "Get started" origin
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state
E2E_SITE_URL=http://localhost:8788 E2E_APP_URL=http://app.localhost:5173 \
  E2E_API_URL=http://api.localhost:5173 E2E_ORIGIN=http://app.localhost:5173 \
  pnpm exec playwright test e2e/scenarios/09-homepage.spec.ts
E2E_TARGET=local-stay-in-the-loop pnpm e2e:report
```

## What changed in the scenario

- `HEADLINE` is now "Stay in the loop with your product.". The prerendered `<h1>`, the hero region's name and the HTML check all use it.
- The prerender check looks for `halo-2400.avif` instead of `dusk-2400.avif`. The render check finds the photo by `/images/halo-`.
- The prerender check finds the dashboard's tab list in the served HTML, and checks there is no feed yet: the demo shows times relative to the reader's clock, so it only renders in the browser.
- The render check waits for the hero's feed to replace the skeleton. It then clicks "Critical errors" and checks that "Checkout is failing" is open, marked "Sent to subscribers", with the #errors filter chip. Before that it opens Agents, clicks "Approve refund" on "Refund $240 to Harbor Labs?" and checks the answer is recorded. That question previews the actions API that isn't built yet (`actions`, `reply`, `expiresIn`, `onExpire`), and its answer lives only in the demo. The same test fails on any console error, which would catch a hydration mismatch.
- A new test blocks the demo's chunk and checks that the headline, the tab list and the rest of the page stay up, with no feed. An error boundary around the demo keeps the skeleton. Without it, a rejected lazy import unmounts the whole page, which happened once on a dev server with a stale module graph.
- The code-sample checks are scoped to `#developers`, because the page now has two tab sets and a page-wide `tabpanel` locator matched both.

## What ran

All 6 tests passed against the production bundle, including the two HTML checks that skip under `vite dev`. Checked by eye at 1900, 1280, 1024 and 390 px. On a phone the hero's tab strip scrolls sideways and the page does not, and the demo's top bar shows the icon without the organization name. The demo's code loads after the page is up (about 135 KB gzipped, mostly recharts); the scripts the homepage loads up front are the same as before. At 1024 px, four columns cut off the cards' notification text, so the grid now has two columns up to `xl` (1280 px) and four from there. The hero copy reads over the sky at every width.
