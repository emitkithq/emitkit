import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { signWebhook } from "@server/platform/webhook-signature";
import { Clock, Context, Effect, Layer, Redacted } from "effect";

/** HKDF `info`: callback signing keys only, one per project (the id follows). */
const KEY_INFO = "emitkit/callback-signing/v1:";
const TIMEOUT_MS = 10_000;

const encoder = new TextEncoder();
const toBase64 = (bytes: ArrayBuffer) =>
  btoa(String.fromCodePoint(...new Uint8Array(bytes)));

export interface Callback {
  readonly projectId: string;
  readonly url: string;
  /** `webhook-id`: the same on every retry, so receivers can drop repeats. */
  readonly id: string;
  /** JSON text. */
  readonly body: string;
}

/** What the receiver answered: a status, or null when it couldn't be reached. */
export interface Delivery {
  readonly ok: boolean;
  readonly status: number | null;
}

/**
 * Callbacks to senders' own URLs, the only outbound requests to addresses
 * customers choose. Signed like Standard Webhooks (Svix), with a secret per
 * project derived by HKDF from BETTER_AUTH_SECRET: nothing is stored, and
 * changing that secret changes every project's callback secret.
 */
export class CallbackSender extends Context.Service<
  CallbackSender,
  {
    /** The project's secret, as `whsec_…` (for the dashboard and to sign). */
    readonly secret: (
      projectId: string
    ) => Effect.Effect<Redacted.Redacted<string>, InfrastructureError>;
    readonly send: (
      callback: Callback
    ) => Effect.Effect<Delivery, InfrastructureError>;
  }
>()("emitkit/platform/CallbackSender") {
  static readonly layer = Layer.effect(
    CallbackSender,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const material = yield* Effect.tryPromise({
        catch: infrastructure("callbacks.material"),
        try: () =>
          crypto.subtle.importKey(
            "raw",
            encoder.encode(Redacted.value(config.authSecret)),
            "HKDF",
            false,
            ["deriveBits"]
          ),
      });

      const secret = Effect.fn("CallbackSender.secret")(function* (
        projectId: string
      ) {
        const bits = yield* Effect.tryPromise({
          catch: infrastructure("callbacks.derive"),
          try: () =>
            crypto.subtle.deriveBits(
              {
                hash: "SHA-256",
                info: encoder.encode(`${KEY_INFO}${projectId}`),
                name: "HKDF",
                salt: new Uint8Array(0),
              },
              material,
              256
            ),
        });
        return Redacted.make(`whsec_${toBase64(bits)}`);
      });

      const send = Effect.fn("CallbackSender.send")(function* (
        outgoing: Callback
      ) {
        const timestamp = String(
          Math.floor((yield* Clock.currentTimeMillis) / 1000)
        );
        const signature = yield* signWebhook(
          yield* secret(outgoing.projectId),
          outgoing.id,
          timestamp,
          outgoing.body
        );
        // Unreachable, timed out or refused: a failed attempt, retried later.
        const status = yield* Effect.tryPromise({
          catch: infrastructure("callbacks.send"),
          try: async () => {
            const response = await fetch(outgoing.url, {
              body: outgoing.body,
              headers: {
                "content-type": "application/json",
                "user-agent": "EmitKit-Callbacks/1",
                "webhook-id": outgoing.id,
                "webhook-signature": `v1,${signature}`,
                "webhook-timestamp": timestamp,
              },
              method: "POST",
              // A redirect could hand the answer to another host.
              redirect: "manual",
              signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            await response.body?.cancel();
            return response.status;
          },
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("callback unreachable", {
              error: String(error.cause),
              id: outgoing.id,
            }).pipe(Effect.as(null))
          )
        );
        return {
          ok: status !== null && status >= 200 && status < 300,
          status,
        } satisfies Delivery;
      });

      return CallbackSender.of({ secret, send });
    })
  );
}
