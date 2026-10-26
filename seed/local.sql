-- Local development seed: `pnpm db:seed:local`
-- (= `wrangler d1 execute DB --local --file=seed/local.sql`).
--
-- Gives the "Continue in local dev" user (dev@example.com, see DEV_USER in
-- src/server/platform/dev-sign-in.ts) a populated workspace, "EmitKit" (/emitkit),
-- that runs four real products under their real URLs: Cal.com, Dub,
-- Plausible and Excalidraw. Customers have addresses at real companies and
-- events carry real links (GitHub commits and pull requests, short links,
-- referrers, invoices), so brand icons, link and email values and revenue
-- all have something to show. 1,440 events span 60 days, growing gently with
-- a daily rhythm, so every dashboard range (24h, 7d, 30d) has a real period
-- before it to compare against. The last half hour is busiest, as a live
-- feed should be.
--
-- Safe to re-run: seeded rows are upserted by id (never INSERT OR REPLACE,
-- whose delete would cascade to sessions and members), and seeded events are
-- deleted and re-inserted relative to the current time. Rows the developer
-- created stay untouched.
--
-- Local only: this file lives outside migrations/ so deploys never apply it.
-- The API key below only exists in local D1 and is not a secret. The people
-- are made up; only their companies' domains are real.

-- Dev user and workspace ----------------------------------------------------

insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
values ('user_seeddev00000000000000000', 'Local Dev', 'dev@example.com', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
on conflict ("email") do nothing;

-- The logo is the app icon the app host already serves, so the workspace
-- header shows the EmitKit mark instead of initials.
insert into "organization" ("id", "name", "slug", "logo", "createdAt")
values ('org_seedacme0000000000000000', 'EmitKit', 'emitkit', '/web-app-manifest-192x192.png',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'))
on conflict ("id") do update set
  "name" = excluded."name", "slug" = excluded."slug", "logo" = excluded."logo";

insert into "member" ("id", "organizationId", "userId", "role", "createdAt")
select 'mbr_seeddev00000000000000000', 'org_seedacme0000000000000000', "id", 'owner',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
from "user" where "email" = 'dev@example.com'
on conflict ("id") do nothing;

-- Point existing dev sessions at the workspace so a signed-in tab lands there too.
update "session" set "activeOrganizationId" = 'org_seedacme0000000000000000'
where "activeOrganizationId" is null
  and "userId" = (select "id" from "user" where "email" = 'dev@example.com');

-- Projects and channels -----------------------------------------------------

insert into "project" ("id", "organization_id", "name", "slug", "url", "description", "first_event_at", "created_at", "updated_at")
values
  ('project_seedcal00000000000000000', 'org_seedacme0000000000000000', 'Cal.com', 'cal', 'https://cal.com', 'Scheduling infrastructure for everyone',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')),
  ('project_seeddub00000000000000000', 'org_seedacme0000000000000000', 'Dub', 'dub', 'https://dub.co', 'Short links with built-in analytics',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-29 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-29 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-29 days')),
  ('project_seedplausible00000000000', 'org_seedacme0000000000000000', 'Plausible', 'plausible', 'https://plausible.io', 'Privacy-friendly web analytics',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-28 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-28 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-28 days')),
  ('project_seedexcalidraw0000000000', 'org_seedacme0000000000000000', 'Excalidraw', 'excalidraw', 'https://excalidraw.com', 'Collaborative hand-drawn whiteboard',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-27 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-27 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-27 days'))
on conflict ("id") do update set
  "name" = excluded."name", "slug" = excluded."slug", "url" = excluded."url",
  "description" = excluded."description", "deleted_at" = null;

with seeded ("id", "project_id", "name", "icon", "description") as (
  values
    ('channel_seedcalsignups0000000000', 'project_seedcal00000000000000000', 'signups', '👋', 'New accounts and teams'),
    ('channel_seedcalbookings000000000', 'project_seedcal00000000000000000', 'bookings', '📅', 'Booked, rescheduled and cancelled'),
    ('channel_seedcalpayments000000000', 'project_seedcal00000000000000000', 'payments', '💳', 'Team plan seats'),
    ('channel_seeddublinks000000000000', 'project_seeddub00000000000000000', 'links', '🔗', 'Short links and click milestones'),
    ('channel_seeddubsignups0000000000', 'project_seeddub00000000000000000', 'signups', '👋', null),
    ('channel_seeddubpayments000000000', 'project_seeddub00000000000000000', 'payments', '💰', 'Pro and Business plans'),
    ('channel_seedplausiblesites000000', 'project_seedplausible00000000000', 'sites', '🌐', 'Sites added and traffic spikes'),
    ('channel_seedplausiblepayments000', 'project_seedplausible00000000000', 'payments', '💶', 'Subscriptions, billed in EUR'),
    ('channel_seedexcalidrawdeploys000', 'project_seedexcalidraw0000000000', 'deploys', '🚀', 'Production and preview deploys'),
    ('channel_seedexcalidrawerrors0000', 'project_seedexcalidraw0000000000', 'errors', '🚨', null),
    ('channel_seedexcalidrawfeedback00', 'project_seedexcalidraw0000000000', 'feedback', '💬', 'In-app feedback'),
    ('channel_seedexcalidrawrooms00000', 'project_seedexcalidraw0000000000', 'collaboration', '👥', 'Live collaboration rooms')
)
insert into "channel" ("id", "organization_id", "project_id", "name", "icon", "description", "created_at", "updated_at")
select "id", 'org_seedacme0000000000000000', "project_id", "name", "icon", "description",
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-27 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-27 days')
from seeded where true
on conflict ("id") do update set
  "name" = excluded."name", "icon" = excluded."icon",
  "description" = excluded."description", "deleted_at" = null;

-- Customers (external identities): made-up people at real companies. Events
-- use their email as `userId`, which the dashboard shows with the company's
-- brand icon.
with seeded ("id", "email", "name", "properties") as (
  values
    ('identity_seedmaya0000000000000000', 'maya@linear.app', 'Maya Chen', '{"plan":"team","seats":12,"website":"https://linear.app"}'),
    ('identity_seedjonas000000000000000', 'jonas@vercel.com', 'Jonas Weber', '{"plan":"pro","website":"https://vercel.com"}'),
    ('identity_seedpriya000000000000000', 'priya@supabase.com', 'Priya Raman', '{"plan":"business","website":"https://supabase.com"}'),
    ('identity_seedleo00000000000000000', 'leo@raycast.com', 'Leo Martins', '{"plan":"pro","website":"https://raycast.com"}'),
    ('identity_seedsara0000000000000000', 'sara@resend.com', 'Sara Okafor', '{"plan":"team","seats":5,"website":"https://resend.com"}'),
    ('identity_seedtom00000000000000000', 'tom@posthog.com', 'Tom Lindqvist', '{"plan":"free","website":"https://posthog.com"}'),
    ('identity_seedana00000000000000000', 'ana@figma.com', 'Ana Duarte', '{"plan":"business","website":"https://figma.com"}'),
    ('identity_seedkenji000000000000000', 'kenji@stripe.com', 'Kenji Sato', '{"plan":"pro","website":"https://stripe.com"}')
)
insert into "external_identity" ("id", "organization_id", "user_id", "email", "name", "properties", "created_at", "updated_at")
select "id", 'org_seedacme0000000000000000', "email", "email", "name", "properties",
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
from seeded where true
on conflict ("id") do update set
  "user_id" = excluded."user_id", "email" = excluded."email",
  "name" = excluded."name", "properties" = excluded."properties";

-- API key `emitkit_localdevseed` for the Cal.com project. `key` is its
-- SHA-256 (base64url, no padding), which is how Better Auth's api-key plugin
-- stores keys. Try it:
--   curl -X POST http://api.localhost:5173/v1/events \
--     -H 'Authorization: Bearer emitkit_localdevseed' -H 'Content-Type: application/json' \
--     -d '{"channelName":"signups","title":"Hello from curl"}'
insert into "apikey" ("id", "configId", "name", "start", "referenceId", "prefix", "key", "enabled",
  "rateLimitEnabled", "rateLimitTimeWindow", "rateLimitMax", "requestCount", "createdAt", "updatedAt", "metadata")
values ('key_seedlocaldev000000000000', 'default', 'Local dev (seed)', 'emitkit_loca', 'org_seedacme0000000000000000',
  'emitkit_', 'orx0Ox7JaorP8Pk10JkDMLNGf2x5DfnOm-aSlqHNdRQ', 1, 1, 60000, 100, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'),
  '{"projectId":"project_seedcal00000000000000000"}')
on conflict ("id") do update set "metadata" = excluded."metadata";

-- Events --------------------------------------------------------------------

delete from "event" where "id" like 'event_seed%';

-- 1,440 events. Events 0–9 arrive every ~3.5 minutes over the last half
-- hour. The rest spread over 60 days behind that: their age in days solves
-- the CDF of a density that falls linearly to two thirds of today's rate
-- (a = 120·(1.5 − √(2.25 − 1.25u)), about +20% month over month), and is then
-- warped to a + k(cos 2πa − 1)/2π, which keeps the order but bunches events
-- into a daily rhythm. A hash jitters each event by a couple of places so the
-- buckets are not suspiciously even.
-- `n % 20` picks one of 20 templates below, `n % 8` the customer and
-- `(n / 20) % 4` a variation (plan, site, link target, referrer).
insert into "event" ("id", "organization_id", "project_id", "channel_id", "channel_name", "title", "description",
  "icon", "tags", "metadata", "user_id", "source", "display_as", "notify", "created_at_ms", "value_amount", "value_currency")
with recursive
  seq(n) as (select 0 union all select n + 1 from seq where n < 1439),
  people(p, email, company) as (
    values (0, 'maya@linear.app', 'Linear'), (1, 'jonas@vercel.com', 'Vercel'),
      (2, 'priya@supabase.com', 'Supabase'), (3, 'leo@raycast.com', 'Raycast'),
      (4, 'sara@resend.com', 'Resend'), (5, 'tom@posthog.com', 'PostHog'),
      (6, 'ana@figma.com', 'Figma'), (7, 'kenji@stripe.com', 'Stripe')
  ),
  variations(v, referrer, site, target, booking) as (
    values
      (0, 'https://news.ycombinator.com', 'https://tailwindcss.com', 'https://github.com/dubinc/dub', '30 min intro'),
      (1, 'https://www.producthunt.com', 'https://astro.build', 'https://vercel.com/blog', 'Product demo'),
      (2, 'https://x.com', 'https://bun.sh', 'https://docs.stripe.com', 'Office hours'),
      (3, 'https://www.reddit.com/r/webdev', 'https://htmx.org', 'https://linear.app/changelog', 'Onboarding call')
  ),
  templates(slot, project_id, channel_id, channel, title, icon, display_as) as (
    values
      (0, 'project_seedcal00000000000000000', 'channel_seedcalsignups0000000000', 'signups', 'New user signed up', '👋', 'message'),
      (1, 'project_seedcal00000000000000000', 'channel_seedcalbookings000000000', 'bookings', 'Booking confirmed', '📅', 'message'),
      (2, 'project_seedcal00000000000000000', 'channel_seedcalbookings000000000', 'bookings', 'Booking rescheduled', '🔁', 'message'),
      (3, 'project_seedcal00000000000000000', 'channel_seedcalpayments000000000', 'payments', 'Team plan purchased', '💳', 'notification'),
      (4, 'project_seedcal00000000000000000', 'channel_seedcalsignups0000000000', 'signups', 'Team created', '🏢', 'message'),
      (5, 'project_seeddub00000000000000000', 'channel_seeddublinks000000000000', 'links', 'Link created', '🔗', 'message'),
      (6, 'project_seeddub00000000000000000', 'channel_seeddublinks000000000000', 'links', 'Link passed a click milestone', '🔥', 'message'),
      (7, 'project_seeddub00000000000000000', 'channel_seeddubpayments000000000', 'payments', 'Plan purchased', '💰', 'notification'),
      (8, 'project_seeddub00000000000000000', 'channel_seeddubsignups0000000000', 'signups', 'New user signed up', '👋', 'message'),
      (9, 'project_seedplausible00000000000', 'channel_seedplausiblesites000000', 'sites', 'Site added', '🌐', 'message'),
      (10, 'project_seedplausible00000000000', 'channel_seedplausiblesites000000', 'sites', 'Traffic spike', '📈', 'notification'),
      (11, 'project_seedplausible00000000000', 'channel_seedplausiblepayments000', 'payments', 'Subscription renewed', '🔁', 'notification'),
      (12, 'project_seedplausible00000000000', 'channel_seedplausiblepayments000', 'payments', 'Upgraded to Business', '💶', 'notification'),
      (13, 'project_seedexcalidraw0000000000', 'channel_seedexcalidrawdeploys000', 'deploys', 'Production deploy finished', '🚀', 'message'),
      (14, 'project_seedexcalidraw0000000000', 'channel_seedexcalidrawdeploys000', 'deploys', 'Preview deployed', '🔍', 'message'),
      (15, 'project_seedexcalidraw0000000000', 'channel_seedexcalidrawerrors0000', 'errors', 'Export to PNG failed', '🚨', 'notification'),
      (16, 'project_seedexcalidraw0000000000', 'channel_seedexcalidrawfeedback00', 'feedback', 'Feedback submitted', '💬', 'message'),
      (17, 'project_seedcal00000000000000000', 'channel_seedcalbookings000000000', 'bookings', 'Booking confirmed', '📅', 'message'),
      (18, 'project_seedexcalidraw0000000000', 'channel_seedexcalidrawrooms00000', 'collaboration', 'Collaboration room opened', '👥', 'message'),
      (19, 'project_seeddub00000000000000000', 'channel_seeddublinks000000000000', 'links', 'Link created', '🔗', 'message')
  ),
  base as (
    select
      seq.n,
      t.*, p.email, p.company, v.v, v.referrer, v.site, v.target, v.booking,
      -- Deterministic hex ids for commits, links and rooms.
      printf('%08x', (seq.n * 2654435761) % 4294967296) as hash,
      cast(unixepoch('now') as integer) * 1000 - case
        when seq.n < 10 then 20000 + seq.n * 210000 + (seq.n * 7919) % 45000
        else 40 * 60000 + cast(86400000 * (
          -- age in days `a`, then the daily-rhythm warp (k = 0.35)
          120 * (1.5 - sqrt(2.25 - 1.25 * min(0.9999, max(0.0,
            (seq.n - 9.5 + 5 * (((seq.n * 2654435761) % 1000) / 1000.0 - 0.5)) / 1430.0))))
          + 0.35 * (cos(2 * pi() * 120 * (1.5 - sqrt(2.25 - 1.25 * min(0.9999, max(0.0,
            (seq.n - 9.5 + 5 * (((seq.n * 2654435761) % 1000) / 1000.0 - 0.5)) / 1430.0))))) - 1) / (2 * pi())
        ) as integer)
      end as at_ms
    from seq
    join templates t on t.slot = seq.n % 20
    join people p on p.p = seq.n % 8
    join variations v on v.v = (seq.n / 20) % 4
  ),
  priced as (
    select
      base.*,
      case slot
        when 3 then 15 * (2 + n % 9)
        when 7 then case when v % 2 = 0 then 24 else 59 end
        when 11 then case v when 0 then 9 when 1 then 19 else 9 end
        when 12 then case when v = 3 then -19 else 69 end
      end as amount,
      -- Mostly USD, so the dashboard's revenue (summed in the currency most
      -- events carried) reads in dollars on every range.
      case slot when 3 then 'USD' when 7 then 'USD' when 11 then 'USD' when 12 then 'EUR' end as currency
    from base
  )
select
  'event_seed' || printf('%020d', n),
  'org_seedacme0000000000000000',
  project_id,
  channel_id,
  channel,
  case when slot = 12 and amount < 0 then 'Refund issued' else title end,
  case slot
    when 0 then 'from ' || replace(referrer, 'https://', '')
    when 1 then booking || ' with ' || company
    when 2 then booking || ' moved to next week'
    when 3 then (2 + n % 9) || ' seats · monthly'
    when 4 then company || ' · ' || (3 + n % 20) || ' members'
    when 5 then 'dub.sh/' || substr(hash, 1, 6)
    when 6 then 'dub.sh/' || substr(hash, 1, 6) || ' · ' || ((v + 1) * 1000) || ' clicks'
    when 7 then case when v % 2 = 0 then 'Pro' else 'Business' end || ' · monthly'
    when 9 then replace(site, 'https://', '')
    when 10 then replace(site, 'https://', '') || ' · ' || (400 + n % 900) || ' visitors in the last hour'
    when 11 then case v when 1 then 'Growth' else 'Starter' end || ' · monthly'
    when 12 then case when amount < 0 then 'Growth plan · refunded' else 'Business · monthly' end
    when 13 then 'v0.' || (40 - n / 40) || '.' || (n / 8 % 5) || ' · ' || (40 + n % 70) || 's'
    when 14 then '#' || (9000 - n) || ' · ' || case v when 0 then 'fix/arrow-binding' when 1 then 'feat/laser-pointer' when 2 then 'perf/canvas-render' else 'chore/deps' end
    when 15 then 'Safari ' || (17 + v) || ' · seen ' || (1 + n % 9) || ' times'
    when 16 then case v when 0 then 'Love the new frames!' when 1 then 'Arrow snapping feels off' when 2 then 'Please add PDF export' else 'Dark mode is perfect' end
    when 17 then booking || ' with ' || company
    when 18 then (2 + n % 7) || ' people drawing'
    when 19 then 'dub.sh/' || substr(hash, 1, 6)
  end,
  case when slot = 12 and amount < 0 then '↩️' else icon end,
  case
    when channel = 'payments' then '["billing"]'
    when channel = 'errors' then '["urgent","export"]'
    when slot = 10 then '["traffic"]'
    else '[]'
  end,
  case slot
    when 0 then json_object('plan', 'free', 'referrer', referrer, 'email', email)
    when 1 then json_object('event_type', booking, 'attendee', email, 'meeting_url', 'https://cal.com/video/' || hash)
    when 2 then json_object('event_type', booking, 'attendee', email, 'reschedule_url', 'https://cal.com/reschedule/' || hash)
    when 3 then json_object('amount', amount, 'currency', currency, 'seats', 2 + n % 9, 'invoice_url', 'https://invoice.stripe.com/i/acct_' || hash)
    when 4 then json_object('team', company, 'website', 'https://' || substr(email, instr(email, '@') + 1))
    when 5 then json_object('short_link', 'https://dub.sh/' || substr(hash, 1, 6), 'destination', target)
    when 6 then json_object('short_link', 'https://dub.sh/' || substr(hash, 1, 6), 'destination', target, 'clicks', (v + 1) * 1000, 'top_referrer', referrer)
    when 7 then json_object('amount', amount, 'currency', currency, 'plan', case when v % 2 = 0 then 'pro' else 'business' end)
    when 8 then json_object('referrer', referrer)
    when 9 then json_object('site', site, 'owner', email)
    when 10 then json_object('site', site, 'referrer', referrer, 'visitors_last_hour', 400 + n % 900)
    when 11 then json_object('amount', amount, 'currency', currency, 'site', site)
    when 12 then json_object('amount', amount, 'currency', currency, 'site', site)
    when 13 then json_object('commit_url', 'https://github.com/excalidraw/excalidraw/commit/' || hash || hash, 'url', 'https://excalidraw.com', 'duration_s', 40 + n % 70)
    when 14 then json_object('pull_request', 'https://github.com/excalidraw/excalidraw/pull/' || (9000 - n), 'preview_url', 'https://excalidraw-' || substr(hash, 1, 7) || '.vercel.app')
    when 15 then json_object('route', '/', 'browser', 'Safari ' || (17 + v), 'issue_url', 'https://github.com/excalidraw/excalidraw/issues/' || (8000 + n))
    when 16 then json_object('rating', 3 + n % 3, 'from', email)
    when 17 then json_object('event_type', booking, 'attendee', email, 'meeting_url', 'https://cal.com/video/' || hash)
    when 18 then json_object('room_url', 'https://excalidraw.com/#room=' || hash || substr(hash, 1, 4), 'participants', 2 + n % 7)
    when 19 then json_object('short_link', 'https://dub.sh/' || substr(hash, 1, 6), 'destination', target)
  end,
  case when slot in (13, 14, 15, 18) then null else email end,
  case when slot in (13, 14) then 'github-actions' else 'api' end,
  display_as,
  -- Notification-style events (payments, errors, traffic spikes) are the
  -- ones a team pushes to their phones.
  case when display_as = 'notification' then 1 else 0 end,
  at_ms,
  amount,
  currency
from priced;
