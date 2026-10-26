# Long events on a phone — 2026-10-06

Tested the uncommitted working tree on top of `2b4f1ff` under `pnpm dev` (seeded database), scenarios `04-dashboard`, `09-homepage` and `19-actions`: 35 passed, 2 skipped (the `09` HTML checks, which need a build).

## The bug

On a 390 px screen an event with a long title, description or channel couldn't be read:

- The collapsed row's second line didn't fit. The channel (up to 45% of the line), the time, "Waiting for an answer" and the bell never shrank, so the description collapsed to "N…" and the rest ran past the right edge. The page scrolled sideways.
- Opening the event didn't help. The title stayed on one line with an ellipsis, and the description wasn't in the details at all. The user's address was truncated too.

## The fix

- `event-feed.tsx`: closed rows still end long text in an ellipsis, but on a phone the description has a line of its own and the channel shrinks before the time does. "Waiting for an answer" shows as "Waiting" below `sm` (screen readers still hear all of it). Open rows show the title, the description and the channel in full, wrapping long URLs and addresses (`wrap-anywhere`). On desktop, closed rows look as before; open rows give the description its own line at every width, which includes the homepage demo's event that opens on load.
- `event-details.tsx`, `event-values.tsx`: the user's address no longer truncates, and every detail value and metadata label breaks long words instead of running under the card's edge. Detail labels align with the first line of a value that wraps.

## Reproduce

```bash
pnpm db:migrate:local && pnpm db:seed:local
PORT=55290 pnpm dev
PORT=55290 pnpm exec playwright test 04-dashboard 09-homepage 19-actions
E2E_TARGET=local pnpm e2e:report
```

The new test, "events feed on a phone: long events stay on screen and read in full", sends an event with a long title, a description containing a long URL and an email address, a long channel, a pending question, a push and a long metadata value. At 390 px it checks that no part of the row shows past the right edge, closed and open, that the page never scrolls sideways, and that once open nothing in the row is cut off. At 1280 px it checks that a closed row still keeps the description and the channel on one line, with the channel's share and the time intact (a build without `sm:contents` fails this). Before the fix the 390 px checks failed on all three counts. The screenshots (`long-event-390-closed`, `long-event-390-open`, and the same two under `screenshots/before/`) stay local.
