/**
 * Prints the SQLite DDL Better Auth needs for the options in
 * src/server/platform/auth-options.ts. Run with `pnpm db:auth-schema` and
 * paste the output into a new migration when auth plugins change.
 */
import { DatabaseSync } from "node:sqlite";

import { makeAuthOptions } from "@server/platform/auth-options";
import { getMigrations } from "better-auth/db/migration";

const noop = () => Promise.resolve();

const options = makeAuthOptions(
  {
    allowSignup: true,
    appUrl: "http://localhost",
    devSignIn: false,
    siteUrl: "http://localhost",
  },
  {
    beforeInvite: () => Promise.resolve(null),
    beforeUserDeleted: () => Promise.resolve(null),
    firstOrganizationId: () => Promise.resolve(null),
    onInvitationAccepted: noop,
    onInvitationCreated: noop,
    onMemberJoined: noop,
    onOrganizationCreated: noop,
    onOrganizationDeleted: noop,
    onUserCreated: noop,
    onUserDeleted: noop,
    sendEmail: noop,
  },
  {
    database: new DatabaseSync(":memory:"),
    secret: "schema-generation-only-secret-000000",
  }
);

const { compileMigrations } = await getMigrations(options);
process.stdout.write(`${await compileMigrations()}\n`);
