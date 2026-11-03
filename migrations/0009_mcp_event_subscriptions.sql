-- MCP Events: webhook subscriptions made through `events/subscribe` on /mcp.
-- The id is derived from (principal, callback url, event name, canonical
-- arguments), so subscribing again refreshes the same row. The principal is
-- the API key (`key_…`) or the OAuth grant (`grant_…`, an `oauthConsent` id)
-- that subscribed: deliveries stop once it is revoked (see src/server/mcp/events.ts).
create table "mcp_subscription" (
  "id" text not null primary key,
  "principal_id" text not null,
  "organization_id" text not null references "organization" ("id") on delete cascade,
  "project_id" text not null references "project" ("id") on delete cascade,
  "name" text not null,
  "arguments" text not null,
  "url" text not null,
  -- Standard Webhooks signing secrets (whsec_…), supplied by the client.
  "secret" text not null,
  "previous_secret" text,
  "previous_secret_until" text,
  "refresh_before" text not null,
  "last_delivery_at" text,
  "last_error" text,
  "created_at" text not null,
  "updated_at" text not null
);
create index "mcp_subscription_project_idx" on "mcp_subscription" ("project_id", "name");
create index "mcp_subscription_principal_idx" on "mcp_subscription" ("principal_id", "url");
create index "mcp_subscription_expiry_idx" on "mcp_subscription" ("refresh_before");
