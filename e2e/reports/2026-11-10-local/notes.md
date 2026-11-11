# Notes: PR #2 after the independent review

Scenarios `02`, `09`, `23` and `24` against `pnpm dev`, on `5ba93c7`. The two skipped tests are `09`'s checks of prerendered HTML, which need a build.

## What this run adds

Each test below was written first and failed on the code before its fix:

- Reconnecting an app doesn't bring back a token from before the revocation (the old token got `200`).
- Revoking one project leaves the app's other projects alone (replaying the revoked refresh token cost the app its other project's token, with `invalid_grant`).
- A consent narrowed to leave out `mcp` cuts off earlier tokens and the grant's existing webhook subscription (the old token got `200`, and an event was still delivered). The test narrows the consent in the local D1.
- Connected apps names every host a client registered.
- A receiver that answers `425` gets the event again.

The `events/*` error codes follow the MCP Events draft, and scenario 23 asserts the new numbers.

## Not covered

- **The billing pause on MCP Events webhooks.** `pnpm dev` here has no Autumn key, so billing is off. It makes the same `pushAllowed` call push makes.
- **A native redirect with no host** in Connected apps. It shows the scheme, and no test registers such a client.
- ChatGPT, Claude and Claude Code need the public hosts and weren't tried.
- `05-push-pwa` wasn't run. It still needs a run on staging or production.

Scenario 24 requests tokens often. Running it again within about a minute can hit the token endpoint's rate limit (`429`), which isn't a failure of the change.
