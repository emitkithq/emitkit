-- Hosted billing (Autumn). One row per organization: a cache of what Autumn
-- says about its plan, plus the two dates EmitKit owns itself. Self-hosted
-- deployments (no AUTUMN_SECRET_KEY) never read it. See src/server/billing.
create table "organization_billing" (
  "organization_id" text not null primary key references "organization" ("id") on delete cascade,
  -- Autumn's view, refreshed by webhook and on a short TTL.
  "plan_id" text,
  "has_access" integer not null default 0,
  "seats" integer not null default 1,
  "trialing" integer not null default 0,
  "past_due" integer not null default 0,
  "trial_ends_at" text,
  "renews_at" text,
  "cancels_at" text,
  -- Set once a plan was ever active, so a lapsed organization isn't "new".
  "ever_subscribed" integer not null default 0,
  "refreshed_at" text,
  -- EmitKit's own: the first event push delivered (ends the setup allowance)
  -- and free access granted by hand (beta organizations, comps).
  "first_push_at" text,
  "comp_until" text,
  "updated_at" text not null
);

-- Organizations that joined during the free beta keep hosted access free for
-- six months after billing launched.
insert into "organization_billing" ("organization_id", "comp_until", "updated_at")
select "id", '2027-03-25T00:00:00.000Z', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
from "organization";
