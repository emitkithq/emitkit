import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer, Redacted } from "effect";

/** HKDF `info`: a key for this purpose only, never the auth secret itself. */
const KEY_INFO = "emitkit/api-key-reveal/v1";
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCodePoint(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);

export interface SealedSecret {
  /** base64(IV ‖ AES-GCM ciphertext and tag) */
  readonly sealed: string;
}

/**
 * Encrypts small secrets at rest (API keys, so owners can reveal them again):
 * AES-256-GCM under a key derived with HKDF-SHA-256 from BETTER_AUTH_SECRET.
 * `context` (the record's id) is bound in as additional data, so a sealed
 * value only opens for the record it was sealed for. Changing
 * BETTER_AUTH_SECRET makes existing values unopenable; the keys still work.
 */
export class SecretBox extends Context.Service<
  SecretBox,
  {
    readonly seal: (
      plaintext: string,
      context: string
    ) => Effect.Effect<SealedSecret, InfrastructureError>;
    readonly open: (
      sealed: string,
      context: string
    ) => Effect.Effect<string, InfrastructureError>;
  }
>()("emitkit/platform/SecretBox") {
  static readonly layer = Layer.effect(
    SecretBox,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const key = yield* Effect.tryPromise({
        catch: infrastructure("secretBox.deriveKey"),
        try: async () => {
          const material = await crypto.subtle.importKey(
            "raw",
            encoder.encode(Redacted.value(config.authSecret)),
            "HKDF",
            false,
            ["deriveKey"]
          );
          return crypto.subtle.deriveKey(
            {
              hash: "SHA-256",
              info: encoder.encode(KEY_INFO),
              name: "HKDF",
              salt: new Uint8Array(0),
            },
            material,
            { length: 256, name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
          );
        },
      });

      const seal = Effect.fn("SecretBox.seal")(function* (
        plaintext: string,
        context: string
      ) {
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const ciphertext = yield* Effect.tryPromise({
          catch: infrastructure("secretBox.seal"),
          try: () =>
            crypto.subtle.encrypt(
              {
                additionalData: encoder.encode(context),
                iv,
                name: "AES-GCM",
              },
              key,
              encoder.encode(plaintext)
            ),
        });
        const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), IV_BYTES);
        return { sealed: toBase64(combined) };
      });

      const open = Effect.fn("SecretBox.open")(function* (
        sealed: string,
        context: string
      ) {
        const bytes = yield* Effect.try({
          catch: infrastructure("secretBox.decode"),
          try: () => fromBase64(sealed),
        });
        const plaintext = yield* Effect.tryPromise({
          catch: infrastructure("secretBox.open"),
          try: () =>
            crypto.subtle.decrypt(
              {
                additionalData: encoder.encode(context),
                iv: bytes.slice(0, IV_BYTES),
                name: "AES-GCM",
              },
              key,
              bytes.slice(IV_BYTES)
            ),
        });
        return decoder.decode(plaintext);
      });

      return SecretBox.of({ open, seal });
    })
  );
}
