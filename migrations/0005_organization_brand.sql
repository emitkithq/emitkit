-- The brand behind an organization, read from Context.dev by domain (see
-- src/server/organizations/brand.ts). One row per organization once a lookup
-- was tried: status 'found' holds the brand, 'none' means there was nothing
-- to read (a mailbox address, an unknown site), so it isn't asked again.
-- Lookups count the paid calls, which are capped per organization.
create table "organization_brand" (
  "organization_id" text not null primary key references "organization" ("id") on delete cascade,
  "status" text not null,
  "domain" text,
  "name" text,
  "description" text,
  "industry" text,
  "subindustry" text,
  "segment" text,
  "icon_url" text,
  "color" text,
  "lookups" integer not null default 0,
  "updated_at" text not null
);
