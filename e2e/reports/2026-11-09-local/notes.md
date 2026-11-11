# Notes: PR #2 after porting to the public repository

Scenarios `02`, `09`, `23` and `24` against `pnpm dev`, on `28a3e10`. This replaces `2026-09-30-local-mcp` as the current evidence for this branch, since that run's commit isn't in the public history.

The two skipped tests are `09`'s checks of prerendered HTML, which need a build.

Two earlier runs of this set failed in the browser (`09` hydration, `24` sign-in) with "Failed to fetch dynamically imported module". Those used a dev server that had just re-optimized its dependencies while `pnpm build` ran alongside it. After a restart, with nothing else running, all of them passed. Don't run a build during a `pnpm dev` E2E run.

## What the review changed

Scenario 23 gained tests, written before the fixes:

- MCP Events on the session-era protocol: `initialize` advertises `events`, and listing, subscribing, delivery and unsubscribing work. The test failed before the change.
- A verification is trusted for a bounded time: a handshake is reused for 24 hours, then a new filter or a refresh verifies again. The test ages `verified_at` in the local D1.
- A receiver that reflects the request body, or replies with the bare challenge, is refused.
- A huge reply is not read whole. Restoring `response.text()` made this test fail with all 256 MiB read, so it does catch the bug.
- `events/list` is empty for a key without `events:read`. No key like this can be made through the product today, so the test narrows one in the local D1.

## Not covered

- ChatGPT, Claude and Claude Code need the public hosts and weren't tried.
- `05-push-pwa` wasn't run. It still needs a run on staging or production.
