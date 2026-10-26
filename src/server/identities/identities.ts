import { infrastructure, NotFoundError } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { makeId } from "@server/platform/ids";
import { stringifyJson } from "@server/platform/json";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

export type JsonRecord = Readonly<Record<string, Schema.Json>>;

export interface IdentifyInput {
  readonly userId: string;
  readonly properties: JsonRecord;
  readonly aliases: readonly string[];
}

export interface IdentityRecord {
  readonly id: string;
  readonly userId: string;
  readonly properties: JsonRecord;
  readonly aliasesCreated: readonly string[];
  readonly updatedAt: string;
}

export interface Erasure {
  readonly id: string;
  readonly userId: string;
  readonly aliasesDeleted: number;
}

export interface ErasedIdentity {
  readonly userId: string;
  readonly erasedAtMs: number;
}

const Properties = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Json)
);
const decodeProperties = Schema.decodeUnknownSync(Properties);
const stringProperty = (properties: JsonRecord, key: string) => {
  const value = properties[key];
  return Schema.is(Schema.String)(value) ? value : null;
};

const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/**
 * External Identities: the customer's own user ids, their properties and
 * aliases. One identity per (organization, user id); an alias belongs to the
 * identity that claimed it last, and a canonical user id outranks an alias.
 */
export class Identities extends Context.Service<
  Identities,
  {
    readonly identify: (
      organizationId: string,
      input: IdentifyInput
    ) => Effect.Effect<IdentityRecord, InfrastructureError>;
    readonly canonical: (
      organizationId: string,
      userId: string
    ) => Effect.Effect<string, InfrastructureError>;
    readonly erase: (
      organizationId: string,
      userId: string
    ) => Effect.Effect<Erasure, NotFoundError | InfrastructureError>;
    readonly erased: (
      organizationId: string
    ) => Effect.Effect<ReadonlyMap<string, number>, InfrastructureError>;
    readonly expire: (
      cutoffIso: string
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/identities/Identities") {
  static readonly layer = Layer.effect(
    Identities,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findByUserId = (organizationId: string, userId: string) =>
        sql<{
          readonly id: string;
          readonly properties: string;
          readonly user_id: string;
        }>`
          select id, properties, user_id from external_identity where organization_id = ${organizationId} and user_id = ${userId}
        `.pipe(
          Effect.map((rows) => rows[0] ?? null),
          Effect.mapError(infrastructure("identities.find"))
        );

      const identify = Effect.fn("Identities.identify")(function* (
        organizationId: string,
        input: IdentifyInput
      ) {
        const timestamp = yield* now;
        const existing = yield* findByUserId(organizationId, input.userId);
        const previous: JsonRecord = existing
          ? decodeProperties(existing.properties)
          : {};
        const merged: JsonRecord = { ...previous, ...input.properties };
        const id = existing?.id ?? (yield* makeId("identity"));
        yield* sql`
          insert into external_identity ${sql.insert({
            created_at: timestamp,
            email: stringProperty(merged, "email"),
            id,
            name: stringProperty(merged, "name"),
            organization_id: organizationId,
            properties: stringifyJson(merged),
            updated_at: timestamp,
            user_id: input.userId,
          })}
          on conflict (organization_id, user_id) do update set
            properties = excluded.properties, email = excluded.email, name = excluded.name, updated_at = excluded.updated_at
        `.pipe(Effect.mapError(infrastructure("identities.upsert")));

        const created: string[] = [];
        for (const alias of new Set(input.aliases)) {
          if (alias === input.userId) {
            continue;
          }
          const owner = yield* findByUserId(organizationId, alias);
          if (owner) {
            continue;
          }
          const claimed = yield* sql<{ readonly alias: string }>`
            insert into external_identity_alias ${sql.insert({
              alias,
              created_at: timestamp,
              identity_id: id,
              organization_id: organizationId,
            })}
            on conflict (organization_id, alias) do update set identity_id = excluded.identity_id, created_at = excluded.created_at
            where external_identity_alias.identity_id <> excluded.identity_id
            returning alias
          `.pipe(Effect.mapError(infrastructure("identities.alias")));
          if (claimed.length > 0) {
            created.push(alias);
          }
        }
        return {
          aliasesCreated: created,
          id,
          properties: merged,
          updatedAt: timestamp,
          userId: input.userId,
        };
      });

      const canonical = Effect.fn("Identities.canonical")(function* (
        organizationId: string,
        userId: string
      ) {
        const rows = yield* sql<{ readonly user_id: string }>`
          select i.user_id as user_id from external_identity_alias a
          join external_identity i on i.id = a.identity_id
          where a.organization_id = ${organizationId} and a.alias = ${userId}
          limit 1
        `.pipe(Effect.mapError(infrastructure("identities.canonical")));
        return rows[0]?.user_id ?? userId;
      });

      const erase = Effect.fn("Identities.erase")(function* (
        organizationId: string,
        userId: string
      ) {
        const identity = yield* findByUserId(organizationId, userId);
        if (!identity) {
          return yield* new NotFoundError({ entity: "identity", id: userId });
        }
        const timestamp = yield* now;
        const aliases = yield* sql<{ readonly alias: string }>`
          delete from external_identity_alias where identity_id = ${identity.id} returning alias
        `.pipe(Effect.mapError(infrastructure("identities.erase.aliases")));
        yield* sql`delete from external_identity where id = ${identity.id}`.pipe(
          Effect.mapError(infrastructure("identities.erase"))
        );
        const erasedIds = [userId, ...aliases.map((row) => row.alias)];
        for (const erasedId of erasedIds) {
          yield* sql`
            insert into erased_identity ${sql.insert({ erased_at: timestamp, organization_id: organizationId, user_id: erasedId })}
            on conflict (organization_id, user_id) do update set erased_at = excluded.erased_at
          `.pipe(Effect.mapError(infrastructure("identities.erase.tombstone")));
        }
        return { aliasesDeleted: aliases.length, id: identity.id, userId };
      });

      const erased = Effect.fn("Identities.erased")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<{
          readonly user_id: string;
          readonly erased_at: string;
        }>`
          select user_id, erased_at from erased_identity where organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("identities.erased")));
        return new Map(
          rows.map((row) => [
            row.user_id,
            DateTime.toEpochMillis(DateTime.makeUnsafe(row.erased_at)),
          ])
        );
      });

      const expire = Effect.fn("Identities.expire")(function* (
        cutoffIso: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          delete from external_identity where updated_at < ${cutoffIso} returning id
        `.pipe(Effect.mapError(infrastructure("identities.expire")));
        yield* sql`delete from erased_identity where erased_at < ${cutoffIso}`.pipe(
          Effect.mapError(infrastructure("identities.expire.erased"))
        );
        return rows.length;
      });

      return Identities.of({ canonical, erase, erased, expire, identify });
    })
  );
}
