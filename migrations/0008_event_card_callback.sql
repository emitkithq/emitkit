-- Callbacks for events that wait for an answer (docs/content/concepts/
-- questions.mdx): where to POST the answer or the expiry, the sender's
-- own state echoed back, and how delivery went. Expiry is still
-- decided when a card is read; status becomes 'expired' in the row only
-- when its expiry callback is sent, so that happens once.
alter table "event_card" add column "callback_url" text;
alter table "event_card" add column "resume" text;
alter table "event_card" add column "callback_attempts" integer not null default 0;
alter table "event_card" add column "callback_last_status" integer;
alter table "event_card" add column "callback_delivered_at_ms" integer;
