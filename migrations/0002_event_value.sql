-- An event's value: money at the top level of its metadata
-- ({ "amount": number, "currency": "EUR" }), extracted at ingest so the
-- dashboard can sum revenue without parsing JSON. See src/shared/event-value.ts.
alter table "event" add column "value_amount" real;
alter table "event" add column "value_currency" text;

-- Events written before this migration: apply the same rule to their metadata.
update "event"
set
  "value_amount" = json_extract("metadata", '$.amount'),
  "value_currency" = upper(json_extract("metadata", '$.currency'))
where
  json_valid("metadata")
  and json_type("metadata", '$.amount') in ('integer', 'real')
  and json_type("metadata", '$.currency') = 'text'
  and upper(json_extract("metadata", '$.currency')) glob '[A-Z][A-Z][A-Z]';
