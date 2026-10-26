import { infrastructure, NotFoundError } from "@server/errors";
import type { ForbiddenError, InfrastructureError } from "@server/errors";
import { Auth } from "@server/platform/auth";
import { SecretBox } from "@server/platform/secret-box";
import { Projects } from "@server/projects/projects";
import type { ApiKey, CreatedApiKey } from "@shared/rpc/schemas";
import { accessOf, scopesFrom, scopesOf } from "@shared/scopes";
import type { KeyAccess } from "@shared/scopes";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

interface ApiKeyRow {
  readonly id: string;
  readonly name: string | null;
  readonly start: string | null;
  readonly enabled: number | null;
  readonly metadata: string | null;
  readonly createdAt: string;
  readonly lastRequest: string | null;
  readonly revealable: number;
}

const Metadata = Schema.fromJsonString(
  Schema.Struct({
    projectId: Schema.optional(Schema.String),
    scopes: Schema.optional(Schema.Unknown),
  })
);
/** A key's project and scopes, read the way `Auth.verifyApiKey` reads them. */
const settingsOf = (metadata: string | null) => {
  const decoded = Option.getOrUndefined(
    Schema.decodeUnknownOption(Metadata)(metadata ?? "")
  );
  // No metadata: a key from before projects. Unreadable: no scopes.
  const unreadable = metadata === null ? undefined : null;
  return {
    projectId: decoded?.projectId ?? null,
    scopes: scopesFrom(decoded ? decoded.scopes : unreadable),
  };
};

interface KeyInput {
  readonly name: string;
  readonly projectId: string;
  /** Default `full`. */
  readonly access?: KeyAccess | undefined;
}

/**
 * Organization-owned API keys (Better Auth `@better-auth/api-key`), each bound
 * to one project through its metadata. Better Auth stores only a hash; the
 * key itself is also kept sealed (`api_key_secret`, SecretBox) so owners and
 * admins can reveal it again. Keys issued before that have no sealed copy.
 */
export class ApiKeys extends Context.Service<
  ApiKeys,
  {
    readonly list: (
      organizationId: string
    ) => Effect.Effect<readonly ApiKey[], InfrastructureError>;
    readonly create: (
      organizationId: string,
      userId: string,
      input: KeyInput
    ) => Effect.Effect<
      CreatedApiKey,
      NotFoundError | ForbiddenError | InfrastructureError
    >;
    readonly rotate: (
      organizationId: string,
      userId: string,
      id: string
    ) => Effect.Effect<
      CreatedApiKey,
      NotFoundError | ForbiddenError | InfrastructureError
    >;
    readonly revoke: (
      organizationId: string,
      id: string
    ) => Effect.Effect<void, NotFoundError | InfrastructureError>;
    /** The full key, for owners and admins; NotFound when it can't be revealed. */
    readonly reveal: (
      organizationId: string,
      id: string
    ) => Effect.Effect<string, NotFoundError | InfrastructureError>;
    readonly revokeForProject: (
      organizationId: string,
      projectId: string
    ) => Effect.Effect<void, InfrastructureError>;
  }
>()("emitkit/api-keys/ApiKeys") {
  static readonly layer = Layer.effect(
    ApiKeys,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const auth = yield* Auth;
      const projects = yield* Projects;
      const box = yield* SecretBox;

      const rows = (organizationId: string) =>
        sql<ApiKeyRow>`
          select k.id, k.name, k.start, k.enabled, k.metadata, k."createdAt", k."lastRequest",
            (s.key_id is not null) as revealable
          from apikey k left join api_key_secret s on s.key_id = k.id
          where k."referenceId" = ${organizationId} order by k."createdAt" desc
        `.pipe(Effect.mapError(infrastructure("apiKeys.list")));

      const list = Effect.fn("ApiKeys.list")(function* (
        organizationId: string
      ) {
        const [keys, all] = yield* Effect.all(
          [rows(organizationId), projects.list(organizationId, true)],
          {
            concurrency: 2,
          }
        );
        const names = new Map(all.map((project) => [project.id, project.name]));
        return keys.map((row): ApiKey => {
          const { projectId, scopes } = settingsOf(row.metadata);
          return {
            access: accessOf(scopes),
            createdAt: row.createdAt,
            enabled: row.enabled !== 0,
            id: row.id,
            lastRequestAt: row.lastRequest,
            name: row.name ?? "API key",
            projectId,
            projectName: projectId ? (names.get(projectId) ?? null) : null,
            revealable: row.revealable === 1,
            start: row.start,
          };
        });
      });

      const find = Effect.fn("ApiKeys.find")(function* (
        organizationId: string,
        id: string
      ) {
        const all = yield* list(organizationId);
        const key = all.find((candidate) => candidate.id === id);
        if (!key) {
          return yield* new NotFoundError({ entity: "api key", id });
        }
        return key;
      });

      const create = Effect.fn("ApiKeys.create")(function* (
        organizationId: string,
        userId: string,
        input: KeyInput
      ) {
        const project = yield* projects.get(organizationId, input.projectId);
        const issued = yield* auth.issueApiKey({
          name: input.name.trim(),
          organizationId,
          projectId: project.id,
          scopes: scopesOf(input.access ?? "full"),
          userId,
        });
        const { sealed } = yield* box.seal(issued.secret, issued.id);
        yield* sql`
          insert into api_key_secret ${sql.insert({
            created_at: DateTime.formatIso(yield* DateTime.now),
            key_id: issued.id,
            organization_id: organizationId,
            sealed,
          })}
        `.pipe(Effect.mapError(infrastructure("apiKeys.seal")));
        const apiKey = yield* find(organizationId, issued.id);
        return { apiKey, secret: issued.secret };
      });

      const revoke = Effect.fn("ApiKeys.revoke")(function* (
        organizationId: string,
        id: string
      ) {
        const deleted = yield* sql<{ readonly id: string }>`
          delete from apikey where id = ${id} and "referenceId" = ${organizationId} returning id
        `.pipe(Effect.mapError(infrastructure("apiKeys.revoke")));
        if (deleted.length === 0) {
          return yield* new NotFoundError({ entity: "api key", id });
        }
      });

      const rotate = Effect.fn("ApiKeys.rotate")(function* (
        organizationId: string,
        userId: string,
        id: string
      ) {
        const current = yield* find(organizationId, id);
        if (!current.projectId) {
          return yield* new NotFoundError({ entity: "project", id: "unbound" });
        }
        const replacement = yield* create(organizationId, userId, {
          access: current.access,
          name: current.name,
          projectId: current.projectId,
        });
        yield* revoke(organizationId, id);
        return replacement;
      });

      const reveal = Effect.fn("ApiKeys.reveal")(function* (
        organizationId: string,
        id: string
      ) {
        const sealedRows = yield* sql<{ readonly sealed: string }>`
          select sealed from api_key_secret
          where key_id = ${id} and organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("apiKeys.reveal")));
        const [row] = sealedRows;
        if (!row) {
          return yield* new NotFoundError({ entity: "revealable api key", id });
        }
        return yield* box.open(row.sealed, id);
      });

      const revokeForProject = Effect.fn("ApiKeys.revokeForProject")(function* (
        organizationId: string,
        projectId: string
      ) {
        yield* sql`
          delete from apikey where "referenceId" = ${organizationId} and json_extract(metadata, '$.projectId') = ${projectId}
        `.pipe(Effect.mapError(infrastructure("apiKeys.revokeForProject")));
      });

      return ApiKeys.of({
        create,
        list,
        reveal,
        revoke,
        revokeForProject,
        rotate,
      });
    })
  );
}
