import { ConflictError, infrastructure, NotFoundError } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export type Role = "owner" | "admin" | "member";

/** An organization and its first owner, who billing and telemetry address. */
export interface OrganizationOwner {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userId: string | null;
  readonly email: string | null;
}

export interface Workspace {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly role: Role;
}

const toRole = (value: string): Role =>
  value === "owner" || value === "admin" ? value : "member";

/** Organization membership lookups (tables owned by Better Auth's organization plugin). */
export class Memberships extends Context.Service<
  Memberships,
  {
    readonly firstOrganizationId: (
      userId: string
    ) => Effect.Effect<string | null, InfrastructureError>;
    readonly workspace: (
      userId: string,
      organizationId: string
    ) => Effect.Effect<Workspace, NotFoundError | InfrastructureError>;
    /** Every organization the user belongs to, oldest membership first. */
    readonly workspaces: (
      userId: string
    ) => Effect.Effect<readonly Workspace[], InfrastructureError>;
    readonly memberUserIds: (
      organizationId: string
    ) => Effect.Effect<readonly string[], InfrastructureError>;
    /** The organization's name and first owner; null when it doesn't exist. */
    readonly owner: (
      organizationId: string
    ) => Effect.Effect<OrganizationOwner | null, InfrastructureError>;
    /**
     * Removes an organization and the API keys issued for it. Its projects,
     * channels, identities, members and invitations go with it (foreign-key
     * cascades); API keys reference it only by id, so they are deleted here.
     */
    readonly forgetOrganization: (
      organizationId: string
    ) => Effect.Effect<void, InfrastructureError>;
    /**
     * Runs before a user deletes their account. Organizations they own alone
     * are deleted with them, so nothing keeps accepting events for a deleted
     * account. If such an organization still has other members, the deletion
     * is refused until ownership is handed over or the organization is gone.
     * Resolves to the organizations it deleted.
     */
    readonly releaseUser: (
      userId: string
    ) => Effect.Effect<
      readonly { readonly id: string; readonly name: string }[],
      ConflictError | InfrastructureError
    >;
  }
>()("emitkit/organizations/Memberships") {
  static readonly layer = Layer.effect(
    Memberships,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const firstOrganizationId = Effect.fn("Memberships.firstOrganizationId")(
        function* (userId: string) {
          const rows = yield* sql<{ readonly organizationId: string }>`
          select "organizationId" from member where "userId" = ${userId} order by "createdAt" asc limit 1
        `.pipe(Effect.mapError(infrastructure("memberships.first")));
          return rows[0]?.organizationId ?? null;
        }
      );

      const workspace = Effect.fn("Memberships.workspace")(function* (
        userId: string,
        organizationId: string
      ) {
        const rows = yield* sql<{
          readonly role: string;
          readonly name: string;
          readonly slug: string;
        }>`
          select m.role as role, o.name as name, o.slug as slug
          from member m join organization o on o.id = m."organizationId"
          where m."userId" = ${userId} and m."organizationId" = ${organizationId}
          limit 1
        `.pipe(Effect.mapError(infrastructure("memberships.workspace")));
        const [row] = rows;
        if (!row) {
          return yield* new NotFoundError({
            entity: "organization",
            id: organizationId,
          });
        }
        return {
          organizationId,
          organizationName: row.name,
          organizationSlug: row.slug,
          role: toRole(row.role),
        };
      });

      const workspaces = Effect.fn("Memberships.workspaces")(function* (
        userId: string
      ) {
        const rows = yield* sql<{
          readonly id: string;
          readonly role: string;
          readonly name: string;
          readonly slug: string;
        }>`
          select o.id as id, m.role as role, o.name as name, o.slug as slug
          from member m join organization o on o.id = m."organizationId"
          where m."userId" = ${userId}
          order by m."createdAt" asc
        `.pipe(Effect.mapError(infrastructure("memberships.workspaces")));
        return rows.map((row): Workspace => ({
          organizationId: row.id,
          organizationName: row.name,
          organizationSlug: row.slug,
          role: toRole(row.role),
        }));
      });

      const memberUserIds = Effect.fn("Memberships.memberUserIds")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<{ readonly userId: string }>`
          select "userId" from member where "organizationId" = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("memberships.users")));
        return rows.map((row) => row.userId);
      });

      const owner = Effect.fn("Memberships.owner")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<{
          readonly name: string;
          readonly userId: string | null;
          readonly email: string | null;
        }>`
          select o.name as name, u.id as userId, u.email as email
          from organization o
          left join member m on m.id = (
            select id from member where "organizationId" = o.id and role = 'owner'
            order by "createdAt" asc limit 1)
          left join "user" u on u.id = m."userId"
          where o.id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("memberships.owner")));
        const [row] = rows;
        return row
          ? {
              email: row.email,
              organizationId,
              organizationName: row.name,
              userId: row.userId,
            }
          : null;
      });

      const forgetOrganization = Effect.fn("Memberships.forgetOrganization")(
        function* (organizationId: string) {
          yield* sql`delete from apikey where "referenceId" = ${organizationId}`.pipe(
            Effect.mapError(infrastructure("memberships.forget.keys"))
          );
          yield* sql`delete from organization where id = ${organizationId}`.pipe(
            Effect.mapError(infrastructure("memberships.forget.organization"))
          );
        }
      );

      const releaseUser = Effect.fn("Memberships.releaseUser")(function* (
        userId: string
      ) {
        const owned = yield* sql<{
          readonly id: string;
          readonly name: string;
          readonly others: number;
          readonly otherOwners: number;
        }>`
          select o.id as id, o.name as name,
            (select count(*) from member x
              where x."organizationId" = o.id and x."userId" != ${userId}) as others,
            (select count(*) from member x
              where x."organizationId" = o.id and x."userId" != ${userId} and x.role = 'owner') as otherOwners
          from member m join organization o on o.id = m."organizationId"
          where m."userId" = ${userId} and m.role = 'owner'
        `.pipe(Effect.mapError(infrastructure("memberships.release")));
        const soleOwned = owned.filter((row) => row.otherOwners === 0);
        const shared = soleOwned.find((row) => row.others > 0);
        if (shared) {
          return yield* new ConflictError({
            message: `You're the only owner of ${shared.name}. Make another member an owner, or delete the organization, before deleting your account.`,
          });
        }
        yield* Effect.forEach(soleOwned, (row) => forgetOrganization(row.id), {
          discard: true,
        });
        return soleOwned.map((row) => ({ id: row.id, name: row.name }));
      });

      return Memberships.of({
        firstOrganizationId,
        forgetOrganization,
        memberUserIds,
        owner,
        releaseUser,
        workspace,
        workspaces,
      });
    })
  );
}
