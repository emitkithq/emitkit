-- An event's fields and actions, and its answer when it waits for one
-- (docs/content/concepts/questions.mdx). One row per event that
-- has fields or actions. The row is a self-contained snapshot of the
-- question, so the answer page and GET /v1/events/{id} never depend on the
-- event store's retention (D1 keeps events 25 h next to Analytics Engine).
create table "event_card" (
  "event_id" text not null primary key,
  "organization_id" text not null references "organization" ("id") on delete cascade,
  "project_id" text not null,
  "channel_id" text not null,
  "channel_name" text not null,
  "title" text not null,
  "description" text,
  "icon" text,
  "fields" text not null default '[]',
  "actions" text not null default '[]',
  -- null when there is nothing to answer (links only); otherwise pending,
  -- answered or canceled. Expired is pending past expires_at_ms, decided
  -- when the row is read.
  "status" text,
  "expires_at_ms" integer,
  "action" text,
  "answer_values" text,
  -- Who answered, copied: the answer outlives the member.
  "answered_by" text,
  "answered_by_name" text,
  "answered_by_email" text,
  "answered_at_ms" integer,
  "created_at_ms" integer not null
);
create index "event_card_organization_time_idx" on "event_card" ("organization_id", "created_at_ms");
-- The retention sweep deletes by age across organizations.
create index "event_card_created_idx" on "event_card" ("created_at_ms");
