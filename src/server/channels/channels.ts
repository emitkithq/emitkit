import { ConflictError, infrastructure, NotFoundError } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { makeId } from "@server/platform/ids";
import { Projects } from "@server/projects/projects";
import { slugify } from "@server/slug";
import type { Channel } from "@shared/rpc/schemas";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

interface ChannelRow {
  readonly id: string;
  readonly organization_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly description: string | null;
  readonly deleted_at: string | null;
  readonly created_at: string;
}

const toChannel = (row: ChannelRow): Channel => ({
  createdAt: row.created_at,
  description: row.description,
  icon: row.icon,
  id: row.id,
  name: row.name,
  projectId: row.project_id,
});

export interface ChannelPatch {
  readonly id: string;
  readonly icon?: string | null | undefined;
  readonly description?: string | null | undefined;
}

export interface ChannelDraft {
  readonly projectId: string;
  readonly name: string;
  readonly icon?: string | undefined;
  readonly description?: string | undefined;
}

const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/** Channels are named streams inside a project; their name is a slug. */
export class Channels extends Context.Service<
  Channels,
  {
    readonly list: (
      organizationId: string,
      projectId?: string | undefined
    ) => Effect.Effect<readonly Channel[], InfrastructureError>;
    readonly create: (
      organizationId: string,
      draft: ChannelDraft
    ) => Effect.Effect<
      Channel,
      ConflictError | NotFoundError | InfrastructureError
    >;
    /** Changes the icon and description; the name (the slug senders use) stays. */
    readonly update: (
      organizationId: string,
      patch: ChannelPatch
    ) => Effect.Effect<Channel, NotFoundError | InfrastructureError>;
    readonly remove: (
      organizationId: string,
      id: string
    ) => Effect.Effect<void, NotFoundError | InfrastructureError>;
    /** Get-or-create by slug for event ingestion; a soft-deleted channel is revived. */
    readonly resolve: (
      organizationId: string,
      draft: ChannelDraft
    ) => Effect.Effect<Channel, InfrastructureError>;
    readonly deletedIds: (
      organizationId: string
    ) => Effect.Effect<ReadonlySet<string>, InfrastructureError>;
    readonly exists: (
      organizationId: string,
      id: string
    ) => Effect.Effect<boolean, InfrastructureError>;
  }
>()("emitkit/channels/Channels") {
  static readonly layer = Layer.effect(
    Channels,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projects = yield* Projects;

      const findBySlug = (projectId: string, slug: string) =>
        sql<ChannelRow>`select * from channel where project_id = ${projectId} and name = ${slug}`.pipe(
          Effect.map((rows) => rows[0] ?? null),
          Effect.mapError(infrastructure("channels.findBySlug"))
        );

      const list = Effect.fn("Channels.list")(function* (
        organizationId: string,
        projectId: string | undefined
      ) {
        const rows = yield* (
          projectId
            ? sql<ChannelRow>`
              select c.* from channel c join project p on p.id = c.project_id
              where c.organization_id = ${organizationId} and c.project_id = ${projectId}
                and c.deleted_at is null and p.deleted_at is null
              order by c.name`
            : sql<ChannelRow>`
              select c.* from channel c join project p on p.id = c.project_id
              where c.organization_id = ${organizationId} and c.deleted_at is null and p.deleted_at is null
              order by c.name`
        ).pipe(Effect.mapError(infrastructure("channels.list")));
        return rows.map(toChannel);
      });

      const insert = Effect.fn("Channels.insert")(function* (
        organizationId: string,
        draft: ChannelDraft,
        slug: string
      ) {
        const id = yield* makeId("channel");
        const timestamp = yield* now;
        yield* sql`insert into channel ${sql.insert({
          created_at: timestamp,
          description: draft.description ?? null,
          icon: draft.icon ?? null,
          id,
          name: slug,
          organization_id: organizationId,
          project_id: draft.projectId,
          updated_at: timestamp,
        })} on conflict (project_id, name) do nothing`.pipe(
          Effect.mapError(infrastructure("channels.insert"))
        );
        const row = yield* findBySlug(draft.projectId, slug);
        if (!row) {
          return yield* infrastructure("channels.insert")(
            "channel vanished after insert"
          );
        }
        return row;
      });

      const create = Effect.fn("Channels.create")(function* (
        organizationId: string,
        draft: ChannelDraft
      ) {
        yield* projects.get(organizationId, draft.projectId);
        const slug = slugify(draft.name, "general");
        const existing = yield* findBySlug(draft.projectId, slug);
        if (existing && existing.deleted_at === null) {
          return yield* new ConflictError({
            message: `Channel #${slug} already exists in this project`,
          });
        }
        if (existing) {
          const timestamp = yield* now;
          yield* sql`update channel set deleted_at = null, icon = ${draft.icon ?? existing.icon}, description = ${draft.description ?? existing.description}, updated_at = ${timestamp} where id = ${existing.id}`.pipe(
            Effect.mapError(infrastructure("channels.revive"))
          );
          return toChannel({
            ...existing,
            deleted_at: null,
            icon: draft.icon ?? existing.icon,
          });
        }
        return toChannel(yield* insert(organizationId, draft, slug));
      });

      const update = Effect.fn("Channels.update")(function* (
        organizationId: string,
        patch: ChannelPatch
      ) {
        const rows = yield* sql<ChannelRow>`
          select c.* from channel c join project p on p.id = c.project_id
          where c.id = ${patch.id} and c.organization_id = ${organizationId}
            and c.deleted_at is null and p.deleted_at is null
        `.pipe(Effect.mapError(infrastructure("channels.find")));
        const [current] = rows;
        if (!current) {
          return yield* new NotFoundError({ entity: "channel", id: patch.id });
        }
        const next = {
          ...current,
          description:
            patch.description === undefined
              ? current.description
              : patch.description?.trim() || null,
          icon: patch.icon === undefined ? current.icon : patch.icon || null,
        };
        const timestamp = yield* now;
        yield* sql`update channel set ${sql.update({
          description: next.description,
          icon: next.icon,
          updated_at: timestamp,
        })} where id = ${current.id}`.pipe(
          Effect.mapError(infrastructure("channels.update"))
        );
        return toChannel(next);
      });

      const remove = Effect.fn("Channels.remove")(function* (
        organizationId: string,
        id: string
      ) {
        const timestamp = yield* now;
        const rows = yield* sql<{ readonly id: string }>`
          update channel set deleted_at = ${timestamp}, updated_at = ${timestamp}
          where id = ${id} and organization_id = ${organizationId} and deleted_at is null returning id
        `.pipe(Effect.mapError(infrastructure("channels.remove")));
        if (rows.length === 0) {
          return yield* new NotFoundError({ entity: "channel", id });
        }
      });

      const resolve = Effect.fn("Channels.resolve")(function* (
        organizationId: string,
        draft: ChannelDraft
      ) {
        const slug = slugify(draft.name, "general");
        const existing = yield* findBySlug(draft.projectId, slug);
        if (existing && existing.deleted_at === null) {
          return toChannel(existing);
        }
        if (existing) {
          const timestamp = yield* now;
          yield* sql`update channel set deleted_at = null, updated_at = ${timestamp} where id = ${existing.id}`.pipe(
            Effect.mapError(infrastructure("channels.revive"))
          );
          return toChannel({ ...existing, deleted_at: null });
        }
        return toChannel(yield* insert(organizationId, draft, slug));
      });

      const deletedIds = Effect.fn("Channels.deletedIds")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          select id from channel where organization_id = ${organizationId} and deleted_at is not null
        `.pipe(Effect.mapError(infrastructure("channels.deletedIds")));
        return new Set(rows.map((row) => row.id));
      });

      const exists = Effect.fn("Channels.exists")(function* (
        organizationId: string,
        id: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          select id from channel where organization_id = ${organizationId} and id = ${id} and deleted_at is null
        `.pipe(Effect.mapError(infrastructure("channels.exists")));
        return rows.length > 0;
      });

      return Channels.of({
        create,
        deletedIds,
        exists,
        list,
        remove,
        resolve,
        update,
      });
    })
  );
}
