import { infrastructure, NotFoundError } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { makeId } from "@server/platform/ids";
import { slugify } from "@server/slug";
import type { Project } from "@shared/rpc/schemas";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

interface ProjectRow {
  readonly id: string;
  readonly organization_id: string;
  readonly name: string;
  readonly slug: string;
  readonly url: string | null;
  readonly description: string | null;
  readonly first_event_at: string | null;
  readonly deleted_at: string | null;
  readonly created_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  createdAt: row.created_at,
  deletedAt: row.deleted_at,
  description: row.description,
  firstEventAt: row.first_event_at,
  id: row.id,
  name: row.name,
  slug: row.slug,
  url: row.url,
});

export interface ProjectDraft {
  readonly name: string;
  readonly url?: string | undefined;
  readonly description?: string | undefined;
}

export interface ProjectPatch {
  readonly id: string;
  readonly name?: string | undefined;
  readonly url?: string | null | undefined;
  readonly description?: string | null | undefined;
}

const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/** Projects group channels and API keys inside an organization. Deletion is soft. */
export class Projects extends Context.Service<
  Projects,
  {
    readonly list: (
      organizationId: string,
      includeDeleted: boolean
    ) => Effect.Effect<readonly Project[], InfrastructureError>;
    readonly get: (
      organizationId: string,
      id: string
    ) => Effect.Effect<Project, NotFoundError | InfrastructureError>;
    readonly liveIds: (
      organizationId: string
    ) => Effect.Effect<readonly string[], InfrastructureError>;
    readonly create: (
      organizationId: string,
      draft: ProjectDraft
    ) => Effect.Effect<Project, InfrastructureError>;
    readonly update: (
      organizationId: string,
      patch: ProjectPatch
    ) => Effect.Effect<Project, NotFoundError | InfrastructureError>;
    readonly remove: (
      organizationId: string,
      id: string
    ) => Effect.Effect<void, NotFoundError | InfrastructureError>;
    readonly restore: (
      organizationId: string,
      id: string
    ) => Effect.Effect<Project, NotFoundError | InfrastructureError>;
    /** Returns the organization's oldest live project, creating "Default" if it has none. */
    readonly ensureDefault: (
      organizationId: string
    ) => Effect.Effect<Project, InfrastructureError>;
    readonly markFirstEvent: (
      projectId: string
    ) => Effect.Effect<void, InfrastructureError>;
    /** Hard-deletes projects soft-deleted before the cutoff (cascades channels). */
    readonly purgeDeleted: (
      cutoffIso: string
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/projects/Projects") {
  static readonly layer = Layer.effect(
    Projects,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const find = (organizationId: string, id: string) =>
        sql<ProjectRow>`select * from project where organization_id = ${organizationId} and id = ${id}`.pipe(
          Effect.mapError(infrastructure("projects.find")),
          Effect.flatMap((rows) => {
            const [row] = rows;
            return row
              ? Effect.succeed(row)
              : Effect.fail(new NotFoundError({ entity: "project", id }));
          })
        );

      const list = Effect.fn("Projects.list")(function* (
        organizationId: string,
        includeDeleted: boolean
      ) {
        const rows = yield* (
          includeDeleted
            ? sql<ProjectRow>`select * from project where organization_id = ${organizationId} order by created_at`
            : sql<ProjectRow>`select * from project where organization_id = ${organizationId} and deleted_at is null order by created_at`
        ).pipe(Effect.mapError(infrastructure("projects.list")));
        return rows.map(toProject);
      });

      const get = Effect.fn("Projects.get")(function* (
        organizationId: string,
        id: string
      ) {
        const row = yield* find(organizationId, id);
        if (row.deleted_at !== null) {
          return yield* new NotFoundError({ entity: "project", id });
        }
        return toProject(row);
      });

      const liveIds = Effect.fn("Projects.liveIds")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          select id from project where organization_id = ${organizationId} and deleted_at is null
        `.pipe(Effect.mapError(infrastructure("projects.liveIds")));
        return rows.map((row) => row.id);
      });

      const uniqueSlug = Effect.fn("Projects.uniqueSlug")(function* (
        organizationId: string,
        name: string
      ) {
        const base = slugify(name, "project");
        // `base-…` as a range ('.' follows '-'), not `like 'base-%'`: D1
        // rejects LIKE patterns over 50 bytes, so long names failed.
        const taken = yield* sql<{ readonly slug: string }>`
          select slug from project where organization_id = ${organizationId}
            and (slug = ${base} or (slug >= ${`${base}-`} and slug < ${`${base}.`}))
        `.pipe(Effect.mapError(infrastructure("projects.slug")));
        const used = new Set(taken.map((row) => row.slug));
        let candidate = base;
        let suffix = 2;
        while (used.has(candidate)) {
          candidate = `${base}-${suffix}`;
          suffix += 1;
        }
        return candidate;
      });

      const create = Effect.fn("Projects.create")(function* (
        organizationId: string,
        draft: ProjectDraft
      ) {
        const id = yield* makeId("project");
        const timestamp = yield* now;
        const slug = yield* uniqueSlug(organizationId, draft.name);
        yield* sql`insert into project ${sql.insert({
          created_at: timestamp,
          description: draft.description ?? null,
          id,
          name: draft.name.trim(),
          organization_id: organizationId,
          slug,
          updated_at: timestamp,
          url: draft.url ?? null,
        })}`.pipe(Effect.mapError(infrastructure("projects.create")));
        const row = yield* find(organizationId, id).pipe(
          Effect.catchTag("NotFoundError", Effect.die)
        );
        return toProject(row);
      });

      const update = Effect.fn("Projects.update")(function* (
        organizationId: string,
        patch: ProjectPatch
      ) {
        const current = yield* find(organizationId, patch.id);
        const timestamp = yield* now;
        yield* sql`update project set ${sql.update({
          description:
            patch.description === undefined
              ? current.description
              : patch.description,
          name: patch.name?.trim() ?? current.name,
          updated_at: timestamp,
          url: patch.url === undefined ? current.url : patch.url,
        })} where id = ${patch.id} and organization_id = ${organizationId}`.pipe(
          Effect.mapError(infrastructure("projects.update"))
        );
        return toProject(yield* find(organizationId, patch.id));
      });

      const remove = Effect.fn("Projects.remove")(function* (
        organizationId: string,
        id: string
      ) {
        yield* find(organizationId, id);
        const timestamp = yield* now;
        yield* sql`update project set deleted_at = ${timestamp}, updated_at = ${timestamp} where id = ${id} and organization_id = ${organizationId}`.pipe(
          Effect.mapError(infrastructure("projects.remove"))
        );
      });

      const restore = Effect.fn("Projects.restore")(function* (
        organizationId: string,
        id: string
      ) {
        yield* find(organizationId, id);
        const timestamp = yield* now;
        yield* sql`update project set deleted_at = null, updated_at = ${timestamp} where id = ${id} and organization_id = ${organizationId}`.pipe(
          Effect.mapError(infrastructure("projects.restore"))
        );
        return toProject(yield* find(organizationId, id));
      });

      const ensureDefault = Effect.fn("Projects.ensureDefault")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<ProjectRow>`
          select * from project where organization_id = ${organizationId} and deleted_at is null order by created_at limit 1
        `.pipe(Effect.mapError(infrastructure("projects.ensureDefault")));
        const [existing] = rows;
        return existing
          ? toProject(existing)
          : yield* create(organizationId, { name: "Default" });
      });

      const markFirstEvent = Effect.fn("Projects.markFirstEvent")(function* (
        projectId: string
      ) {
        const timestamp = yield* now;
        yield* sql`update project set first_event_at = ${timestamp} where id = ${projectId} and first_event_at is null`.pipe(
          Effect.mapError(infrastructure("projects.markFirstEvent"))
        );
      });

      const purgeDeleted = Effect.fn("Projects.purgeDeleted")(function* (
        cutoffIso: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          delete from project where deleted_at is not null and deleted_at < ${cutoffIso} returning id
        `.pipe(Effect.mapError(infrastructure("projects.purge")));
        return rows.length;
      });

      return Projects.of({
        create,
        ensureDefault,
        get,
        list,
        liveIds,
        markFirstEvent,
        purgeDeleted,
        remove,
        restore,
        update,
      });
    })
  );
}
