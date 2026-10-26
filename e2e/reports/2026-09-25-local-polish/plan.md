# Dashboard polish: punch list

Audit: `pnpm dev` (port 5183) with the seeded DB. "Before" shots come from a
pristine checkout of `1d68380` on port 5184 (light only: there was no dark
mode), "after" from this branch in light and dark, both at 1440 and 390 px,
captured by `e2e/capture/screens.spec.ts`.

Principle: simplicity. Remove before adding, one pattern per problem.

Legend: [x] done · [~] deferred (reason given) · [?] needs a decision

## P0: missing or broken

- [x] **Dark mode.** System / Light / Dark in the account menu, stored in
      `localStorage["emitkit:theme"]`, applied before first paint by an inline
      script in `index.html`; System follows the OS live. Wordmark/mark go
      white on dark via `tone="auto"`; accent text uses the soft foreground
      (Signal on dark); pulse line and open-event shadow follow the theme;
      `theme-color` and `color-scheme` follow. E2E `12-theme`.
- [x] **Channels screen** at `/$org/channels`: grouped by project, project
      filter in the URL, create in a chosen project, edit icon + description,
      delete with confirmation, "View events". Backend `Channels.update` +
      `channels.update` RPC. E2E `11-channels`.
- [?] Channel **rename** left out: the name is the slug senders pass as
      `channelName`, so renaming changes API behaviour. Decision for Chris.
- [x] **Projects overview** reworked into one HeroUI Pro ListView: brand icon,
      name, host, channel count, "No events yet"; row menu (View events,
      Channels, Edit, Delete); Active / Deleted segment with Restore. E2E
      `10-projects`.
- [?] **Top-bar navigation.** Not added (it would redesign the settled feed
      chrome). Channels is reachable from the account menu, ⌘K and project
      rows. Decision for Chris whether to add Events / Projects / Channels
      to the top bar.
- [x] **Accept invitation** no longer toasts "Something went wrong" (or logs
      a console error) next to "Verify your email first": its query moved off
      Better Auth UI's `["auth"]` key prefix.

## Found during the audit (not on the original list)

- [x] Wrong password read "Unauthorized" under HTTP/1.1 (auth client only
      replaced an empty reason phrase). Now "Invalid email or password".
- [x] Creating a project with a 49+ character slug returned 500: D1 rejects
      LIKE patterns over 50 bytes. The slug lookup is now a range query.
- [x] At 390 px a long channel name widened the page to 784 px; the empty
      feed's code snippet ran off screen. Both fit now (every 390 shot is
      390 wide).
- [x] "No results" had no way out: now "Clear search".
- [x] Three E2E checks failed under `vite dev` before any change (two need a
      built bundle and now skip under dev, one was the reason-phrase bug).

## P1: ugly or inconsistent

- [x] Feed loads behind skeleton rows, not "Loading events…".
- [x] Feed error state uses a HeroUI Button.
- [x] Pulse sparklines clipped to the card's rounded corners.
- [x] Empty workspace: no "0%" chip, no flat line along the card edge; the
      card keeps its height while loading; the revenue hint waits for data.
- [x] Empty feed tabs no longer stretch; snippet fits the column.
- [x] Project switcher: chevron icon, no grey dot.
- [x] Projects/Channels load behind a list skeleton; errors show one
      "Try again".
- [x] Settings: Better Auth UI cards get the same flat bordered style as ours.
- [x] Badges are soft HeroUI Chips in sentence case.
- [x] Settings on mobile checked in both themes (scrolling section row).
- [x] Hand-spelled `text-[13.5px]`-style sizes → `text-body/meta/label/title`
      (avatar initials and the event emoji keep fixed sizes).
- [x] Uppercase eyebrows → Title Case (settings, account menu, event details).
- [~] Getting started keeps its uppercase step eyebrow: it's the one
      brand-led onboarding moment. Easy to change if unwanted.
- [x] Open event card uses the theme's overlay shadow (was a hard-coded
      black rgba).

## P2: consistency pass

- [x] Button hierarchy: one solid primary per view (Create project/channel,
      Send invitation…), `tertiary` Cancel, `ghost` icon-only, `secondary`
      for recoverable actions (Restore, Try again, Clear search),
      `danger-soft` Revoke, `danger` to confirm.
- [x] Focus rings: event rows, account menu items, settings nav, header
      search (HeroUI Button + tooltip); HeroUI components bring their own.
- [x] Toasts: "Created/Saved/Deleted/Restored <name>" everywhere.
- [x] Destructive actions confirm: event, channel, project, key revoke and
      rotate, member removal. (Cancelling an invitation doesn't; it's undone
      by inviting again.)
- [x] Page titles: "Events · Acme · EmitKit", "Projects · …", "Channels · …",
      "Sign in · EmitKit", "Getting started", "Accept invitation", "Page not
      found", "Something went wrong".
- [x] Favicon and PWA icons were already the kit's `icon-standard-rounded`;
      `theme-color` now follows the theme.
- [x] Empty states each have one next action (Create project, Create channel,
      Go to projects, the send-an-event snippet, Clear search).

## Deferred, with reasons

- [~] Wrong password shows the error inline and as a toast. Better Auth UI's
      sign-in form hard-codes toast mode for that mutation, and its toaster
      also `console.error`s it; changing either needs a patch to the library.
- [~] Parsew brand icons 401 locally: the publishable key doesn't allow the
      `app.localhost` origin, so logos fall back to initials in dev. Not an
      app bug; deployed hosts are unaffected.
- [~] The capture itself trips Better Auth's rate limit (100 requests / 10 s
      per IP) near the end; it pauses before the last groups. Real use
      doesn't come near it.
- [~] After about three hours and thousands of requests, the local dev
      server started failing Better Auth's `get-session` with workerd's
      "Cannot perform I/O on behalf of a different request" (raised from
      `cloudflare-internal:tracing-helpers` around a D1 query). Three E2E
      tests failed during that window. A fresh `pnpm dev` passed 50/50 with
      no occurrence. Not caused by this work (unchanged session code), but
      worth watching in production logs.
