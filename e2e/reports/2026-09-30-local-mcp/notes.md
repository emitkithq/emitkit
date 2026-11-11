# Notes: MCP Events and OAuth for MCP clients

This report covers two changes on one branch:

- **MCP Events**: webhook delivery on MCP protocol 2026-07-28.
- **OAuth 2.1**: ChatGPT, Claude and other MCP clients connect by signing in and picking a project on a standalone consent screen.

The scenarios are `23-mcp-events.spec.ts` and `24-mcp-oauth.spec.ts`. Each lists, at the top, the ways it could fail. Both were written before their implementation, as `14-mcp-events` and `15-mcp-oauth`, and renumbered when `main` (which has its own `14` and `15`) was merged in. `report.md` is the last run: `02-public-api`, `23` and `24` on the dev server, **42 passed**.

## Merged with main, and the code review

The branch was 22 commits behind `main`, which rewrote the public API into one operation layer (`Principal`, scopes, read-only keys), added answers and callbacks (`answer.*` queue messages, `webhook-signature.ts`), sign-in codes instead of magic links, and migrations `0003` to `0008`. The merge moved the feature onto that code:

- **Migrations** `0003_mcp_event_subscriptions` and `0004_oauth` are now `0009` and `0010`, after `main`'s. They apply cleanly on a fresh local D1 after `0001` to `0008`.
- **OAuth grants are a `Principal`** (`via: "oauth"`, the grant id as `credentialId`, every scope). Tool calls run the same `PublicApi` operations as API keys, and a grant sees all seven tools. `PublicApi.asCaller` is gone.
- **Every MCP request authenticates first**, as `main` does for API keys, so `events/list` with a bad key is now HTTP `401`. Before, it answered any `Bearer emitkit_…`. Every request counts toward the 100-a-minute limit for a grant too.
- **Push and MCP fan-out are separate queue messages** (`event.created` and `mcp.fanout`). Before, a failed MCP fan-out retried the shared message and sent the Web Push again. The worker only dispatches messages by type. A failed delivery fails with `WebhookDeliveryError`, and the queue retries it.
- **Callback URLs**: trailing dots are removed before the name checks (`localhost.`, `x.local.`, `metadata.google.internal.`), and IPv6 is limited to global unicast without 6to4, Teredo or documentation space. The verification challenge is compared in constant time (`constantTimeEqual`, shared with Svix verification). Signing uses `main`'s `signWebhook`.
- **MCP Events need MCP 2.0** at the time of this report: session-era requests got `-32601` for `events/*`. (Later changed: see `2026-11-09-local`, MCP Events now work on `initialize`.) The subscribe result has exactly the spec's fields (`deliveryStatus` removed).
- **A failed JWKS lookup** is logged and answered `500`, not treated as an invalid token (`401`).
- **Sign-in codes**: `main` replaced magic links with emailed codes. The provider resumes the flow for any sign-in that carries the signed query and sets a session, and the remembered-query plugin covers `/sign-in/email-otp`. `24` now signs in by code (read from the local Worker's sent mail) and lands on the consent screen.
- **Consent screen**: `main` removed `/getting-started`. Someone without a workspace now creates one on the consent screen (`gettingStarted.ensureWorkspace`) and stays in the flow. `oauth` is a reserved organization slug.
- **Artifacts**: `report.ts` now also redacts cookies written as objects (HAR `cookies` entries, Playwright's storage state), plain or escaped. In this run's raw trace for the sign-in test, 126 session-cookie values matched; after redaction, 0 did. Only `report.md` and `notes.md` are committed, per `.gitignore`. The traces, logs and screenshots stay local.

## Runs

| Server | Scenarios | Result |
| --- | --- | --- |
| `pnpm dev` (port 5793) | `02`, `23`, `24` | 42 passed. This is the run in `report.md` |
| `pnpm dev` (port 5793) | `01`, `02`, `03`, `04`, `09`, `13`, `19`, `20`, `21` | 71 passed, 7 skipped (build-only checks) |
| `pnpm build` + `pnpm preview` (port 5173) | `01`, `09`, `13`, `23`, `24` | All passed; the delivery tests skip, because a build refuses `http://localhost` callbacks, which `23` asserts. One run of `24` hit Better Auth's sign-in rate limit right after `13` (many sign-ins from one address in a minute). It passed when run again a minute later |

`24`'s member check demotes the owner through the local D1 database (`wrangler d1 execute --local`), then restores them. It only runs against the local target.

Under `vite dev`, the sign-up page briefly visits `/`, which makes the newcomer a workspace. In a build it doesn't, and the consent screen offers **Create a workspace**. `24`'s sign-up test accepts both and clicks the button when it's there. The build run took that path.

## OAuth, checked by hand (before the merge; unchanged since)

- **Loopback clients.** The provider refuses `http://localhost` redirects for clients registered without `application_type` ("web clients require https"). Claude Code and the MCP SDKs register that way. A registration whose redirects are all http loopback URIs is saved as `native` (`oauth-clients.ts`), and `24` registers exactly such a client. An `https://chatgpt.com/...` registration was checked by hand and still registers as a web client.
- **Project picker loop.** The provider's `continue` clears the post-login step only for queries carrying `ba_pl`, which it adds to consent redirects, not post-login ones. The consent screen sends `x-emitkit-project-picked: 1` on its own continue, and `shouldRedirect` lets exactly that request through. `24`'s deleted-project test shows the picker again on the next authorization.
- **Signed query.** TanStack Router's `location.searchStr` re-encodes the repeated `ba_param` as JSON, which broke the signature. The sign-in page remembers the raw `window.location.search` instead.
- **Clients that leave out `resource`.** Authorize and token requests without `resource` get the MCP endpoint (`defaultResource` in `oauth-clients.ts`); `24` exchanges a code with neither `resource` nor `scope` and uses the token.
- **Protected-resource metadata.** Both the path-inserted document and the root one name `<API_URL>/mcp`. RFC 9728 §3.3 would have the root one name the origin, but then clients falling back to it would ask for tokens for a resource the provider doesn't know. MCP servers do the same; see `architecture.md`.

## The queue consumer, checked in the logs

- The dev server logged `push fan-out { delivered: 0, … }` and `MCP Events fan-out { eventId, subscribers: 1 }` as separate messages.
- In the retry test the receiver answers `500` once: the log shows `queue message failed; retrying WebhookDeliveryError`, and the retry arrived with the same `webhook-id` and body, and a new timestamp and signature. `Message.attempts` starts at 1, so `min(60, 5 · 2^attempts)` backs off 10, 20 and 40 s.
- A redirecting receiver gets the delivery once (a `307` is a refusal, not retried), and the redirect target gets nothing.

## Reproduce

```bash
pnpm db:migrate:local
PORT=5793 pnpm dev
PORT=5793 E2E_TARGET=local pnpm exec playwright test e2e/scenarios/02-public-api.spec.ts \
  e2e/scenarios/23-mcp-events.spec.ts e2e/scenarios/24-mcp-oauth.spec.ts
PORT=5793 E2E_TARGET=local pnpm e2e:report   # then move it next to these notes

# The build (its local URLs use port 5173)
pnpm build
pnpm preview --port 5173 --strictPort
E2E_TARGET=local pnpm exec playwright test e2e/scenarios/01-routing.spec.ts \
  e2e/scenarios/09-homepage.spec.ts e2e/scenarios/23-mcp-events.spec.ts e2e/scenarios/24-mcp-oauth.spec.ts
```

## Not covered: check after deploying

- **ChatGPT and Claude themselves.** They need the public https hosts. After deploying, add `https://api.emitkit.com/mcp` as a connector in each, authorize a project, call `createEvent`, and revoke from Settings → Connected apps.
- **`05-push-pwa` on staging or production.** Real Web Push through the queue consumer, now that push and MCP fan-out are separate messages.
- **MCP Events delivery on production.** It needs a public `https` receiver.
