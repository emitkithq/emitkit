# Notes: dusk photo hero (local production bundle)

This run covers the hero redesign from the Paper file "EmitKit - Brand kit" (Hero 6 — Photo frame B). The dashboard screenshot is gone from the hero. It is now a rounded frame holding the kit's dusk photo (`dusk-{1200,2400}.{avif,webp}`), with the copy set on the photo. Below the copy, a live stack of push notifications sits in the landscape. A new event lands on top every 3.2 s and pushes the older ones back. There is no device frame, and film grain covers the whole frame. The same change sets every marketing-site heading to regular weight.

The run used the working tree on top of `4d6b69e`. The change was not committed yet, which is why the report shows that commit.

## Reproduce

`local-hero-dusk` only names this report directory. It is not a target preset.

```bash
pnpm dev                                           # app host, for the "Get started" origin
pnpm build
pnpm exec wrangler dev -c dist/emitkit/wrangler.json --port 8788 --persist-to .wrangler/state
E2E_SITE_URL=http://localhost:8788 E2E_APP_URL=http://app.localhost:5183 \
  E2E_API_URL=http://api.localhost:5183 E2E_ORIGIN=http://app.localhost:5183 \
  pnpm exec playwright test e2e/scenarios/09-homepage.spec.ts
E2E_TARGET=local-hero-dusk pnpm e2e:report
```

Set `E2E_APP_URL` to the dev server's port (5183 here) so it matches the `emitkit:app-url` the Worker injects.

## What changed in the scenario

- The prerender check now looks for the hero photo's `<picture>` (`dusk-2400.avif`) instead of `dashboard-1920.avif`.
- The render check finds the hero photo by its source, because it is decorative (`alt=""`), and waits for it to load. It also checks that the stack's first card, "Agent needs a human", is visible inside the hero region. The push section further down shows the same event, so the check is scoped to the hero.

## What ran

All 5 tests passed:

- The served page is prerendered: headline, hero photo `<picture>`, section anchors and FAQ structured data.
- The page renders and hydrates with no errors, and every image loads.
- With JavaScript off, headings and paragraphs are opaque.
- With reduced motion, the front notification shows at once at full opacity. The stack does not cycle.
- At 390 px wide, the page does not scroll sideways.

## Checked by hand

- At 1440 and 390 px, compared with the Paper export.
- The stack starts from the same three cards the prerender renders, so hydration matches. It cycles only after hydration, pauses while the tab is hidden, and puts the newest card first in the DOM.
- The frame keeps the same height as cards change, because every card is a fixed single-line height. Checked at 1440 and 390 px.
