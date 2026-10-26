import { ConflictError, infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Clock, Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface StoredResponse {
  readonly status: number;
  readonly body: string;
}

/** A keyed command's response: its own when it ran, the stored one when replayed. */
export type IdempotentResult<A extends StoredResponse> =
  | { readonly replayed: false; readonly response: A }
  | { readonly replayed: true; readonly response: StoredResponse };

export interface IdempotencyScope {
  readonly apiKeyId: string;
  readonly key: string;
  readonly fingerprint: string;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** A claim with status 0 means the first request is still running. */
const PENDING = 0;

/**
 * Keyed command idempotency for the public API (`Idempotency-Key`, 24 h).
 * The first request claims the key; replays with the same fingerprint get the
 * stored response, a different fingerprint or an in-flight claim is a conflict.
 * A command that fails releases its claim, so it can be retried.
 */
export class Idempotency extends Context.Service<
  Idempotency,
  {
    readonly run: <A extends StoredResponse, E>(
      scope: IdempotencyScope,
      execute: Effect.Effect<A, E>
    ) => Effect.Effect<
      IdempotentResult<A>,
      E | ConflictError | InfrastructureError
    >;
    readonly expire: (
      nowMs: number
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/idempotency/Idempotency") {
  static readonly layer = Layer.effect(
    Idempotency,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /** Claims the key (taking over an expired receipt), or returns the receipt to replay. */
      const claim = Effect.fn("Idempotency.claim")(function* (
        scope: IdempotencyScope
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        const claimed = yield* sql<{ readonly status: number }>`
          insert into idempotency_receipt ${sql.insert({
            api_key_id: scope.apiKeyId,
            body: "",
            created_at_ms: nowMs,
            fingerprint: scope.fingerprint,
            idempotency_key: scope.key,
            status: PENDING,
          })}
          on conflict (api_key_id, idempotency_key) do update set
            status = ${PENDING}, body = '', fingerprint = excluded.fingerprint, created_at_ms = excluded.created_at_ms
          where idempotency_receipt.created_at_ms < ${nowMs - WINDOW_MS}
          returning status
        `.pipe(Effect.mapError(infrastructure("idempotency.claim")));
        if (claimed.length > 0) {
          return null;
        }
        const [receipt] = yield* sql<{
          readonly status: number;
          readonly body: string;
          readonly fingerprint: string;
        }>`
          select status, body, fingerprint from idempotency_receipt
          where api_key_id = ${scope.apiKeyId} and idempotency_key = ${scope.key}
        `.pipe(Effect.mapError(infrastructure("idempotency.read")));
        if (
          !receipt ||
          receipt.fingerprint !== scope.fingerprint ||
          receipt.status === PENDING
        ) {
          return yield* new ConflictError({
            message:
              "This idempotency key was already used with a different request",
          });
        }
        return { body: receipt.body, status: receipt.status };
      });

      const settle = (
        scope: IdempotencyScope,
        response: StoredResponse | null
      ) =>
        (response
          ? sql`
              update idempotency_receipt set status = ${response.status}, body = ${response.body}
              where api_key_id = ${scope.apiKeyId} and idempotency_key = ${scope.key}
            `
          : sql`
              delete from idempotency_receipt where api_key_id = ${scope.apiKeyId} and idempotency_key = ${scope.key}
            `
        ).pipe(Effect.mapError(infrastructure("idempotency.settle")));

      const run = Effect.fn("Idempotency.run")(function* <
        A extends StoredResponse,
        E,
      >(scope: IdempotencyScope, execute: Effect.Effect<A, E>) {
        const replay = yield* claim(scope);
        if (replay) {
          return {
            replayed: true,
            response: replay,
          } satisfies IdempotentResult<A>;
        }
        const result = yield* Effect.result(execute);
        yield* settle(scope, result._tag === "Success" ? result.success : null);
        if (result._tag === "Failure") {
          return yield* Effect.fail(result.failure);
        }
        return {
          replayed: false,
          response: result.success,
        } satisfies IdempotentResult<A>;
      });

      const expire = Effect.fn("Idempotency.expire")(function* (nowMs: number) {
        const rows = yield* sql<{ readonly key: string }>`
          delete from idempotency_receipt where created_at_ms < ${nowMs - WINDOW_MS} returning idempotency_key as key
        `.pipe(Effect.mapError(infrastructure("idempotency.expire")));
        return rows.length;
      });

      return Idempotency.of({ expire, run });
    })
  );
}
