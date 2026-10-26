import { buildPushHTTPRequest } from "@pushforge/builder";
import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer, Redacted, Schema } from "effect";

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Payload understood by web/public/app/service-worker.js. */
export interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
  readonly icon?: string;
}

/** The push service no longer knows this subscription; delete it. */
export class PushSubscriptionGoneError extends Schema.TaggedError<PushSubscriptionGoneError>()(
  "PushSubscriptionGoneError",
  { endpoint: Schema.String }
) {}

const fromBase64Url = (value: string) => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
};

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

/**
 * VAPID keys are stored as the browser-facing raw public key (65-byte
 * uncompressed P-256 point) and the private scalar `d`; the JWK the push
 * library needs is rebuilt from those two values.
 */
const vapidJwk = (publicKey: string, privateScalar: string): JsonWebKey => {
  const point = fromBase64Url(publicKey);
  return {
    crv: "P-256",
    d: privateScalar,
    ext: true,
    kty: "EC",
    x: toBase64Url(point.slice(1, 33)),
    y: toBase64Url(point.slice(33, 65)),
  };
};

/** Delivers Web Push messages (RFC 8030/8291) with VAPID. */
export class WebPush extends Context.Service<
  WebPush,
  {
    readonly publicKey: string;
    readonly send: (
      target: PushTarget,
      payload: PushPayload
    ) => Effect.Effect<void, PushSubscriptionGoneError | InfrastructureError>;
  }
>()("emitkit/platform/WebPush") {
  static readonly layer = Layer.effect(
    WebPush,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const privateJWK = vapidJwk(
        config.vapid.publicKey,
        Redacted.value(config.vapid.privateKey)
      );

      const send = Effect.fn("WebPush.send")(function* (
        target: PushTarget,
        payload: PushPayload
      ) {
        const request = yield* Effect.tryPromise({
          catch: infrastructure("push.build"),
          try: () =>
            buildPushHTTPRequest({
              message: {
                adminContact: config.vapid.subject,
                options: { ttl: 60 * 60 * 24, urgency: "high" },
                payload: { ...payload },
              },
              privateJWK,
              subscription: {
                endpoint: target.endpoint,
                keys: { auth: target.auth, p256dh: target.p256dh },
              },
            }),
        });
        const response = yield* Effect.tryPromise({
          catch: infrastructure("push.deliver"),
          try: () =>
            fetch(request.endpoint, {
              body: request.body,
              headers: request.headers,
              method: "POST",
            }),
        });
        if (response.status === 404 || response.status === 410) {
          return yield* new PushSubscriptionGoneError({
            endpoint: target.endpoint,
          });
        }
        if (!response.ok) {
          const detail = yield* Effect.promise(() => response.text());
          return yield* infrastructure("push.deliver")(
            `push service answered ${response.status}: ${detail}`
          );
        }
      });

      return WebPush.of({ publicKey: config.vapid.publicKey, send });
    })
  );
}
