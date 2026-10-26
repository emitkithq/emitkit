-- API keys that owners and admins can reveal again. Better Auth keeps only a
-- hash in "apikey"; this table keeps the key sealed with AES-GCM (see
-- src/server/platform/secret-box.ts). Keys issued before this migration have
-- no row here and can't be revealed until they are rotated.
create table "api_key_secret" (
  "key_id" text not null primary key references "apikey" ("id") on delete cascade,
  "organization_id" text not null references "organization" ("id") on delete cascade,
  "sealed" text not null,
  "created_at" text not null
);
