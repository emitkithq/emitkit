-- Events each organization has sent through the public API and MCP, counted
-- only while operator telemetry is on (src/server/telemetry/milestones.ts).
-- Reaching a threshold (the first event, 100, 1,000, …) is a milestone.
create table "organization_usage" (
  "organization_id" text not null primary key references "organization" ("id") on delete cascade,
  "events" integer not null default 0
);

-- Organizations that already had events aren't reported as sending their
-- first one. Their count starts from the D1 event table: every event kept
-- with EVENT_STORE=d1, only the last ~25 hours (the hot buffer) with
-- Analytics Engine, and at least 1. So with Analytics Engine their next
-- milestones undercount what they sent before this migration.
insert into "organization_usage" ("organization_id", "events")
select o."id",
  max(1, (select count(*) from "event" e where e."organization_id" = o."id"))
from "organization" o
where exists (
  select 1 from "project" p
  where p."organization_id" = o."id" and p."first_event_at" is not null
);
