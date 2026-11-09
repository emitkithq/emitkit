-- When the callback URL last passed the verification handshake. A handshake
-- is reused only for a bounded time (see src/server/mcp/events.ts); no value
-- means the next subscribe verifies again.
alter table "mcp_subscription" add column "verified_at" text;
