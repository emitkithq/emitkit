import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { Effect, Redacted } from "effect";

/** Svix rejects deliveries older or newer than this; so do we (replay window). */
const TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);

const encodeBase64 = (bytes: ArrayBuffer) =>
  btoa(String.fromCodePoint(...new Uint8Array(bytes)));

/** Compares two strings in time independent of where they differ. */
const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    // oxlint-disable-next-line no-bitwise -- constant-time comparison
    difference |= (a.codePointAt(index) ?? 0) ^ (b.codePointAt(index) ?? 0);
  }
  return difference === 0;
};

/**
 * A Standard Webhooks signature (what Svix sends): base64 HMAC-SHA256 over
 * `${id}.${timestamp}.${body}`, keyed with the bytes behind a `whsec_`
 * secret. Used to verify Autumn's webhooks and to sign our callbacks.
 */
export const signWebhook = Effect.fn("signWebhook")(function* (
  secret: Redacted.Redacted<string>,
  id: string,
  timestamp: string,
  body: string
): Effect.fn.Return<string, InfrastructureError> {
  const raw = Redacted.value(secret);
  const keyBytes = yield* Effect.try({
    catch: infrastructure("webhook.secret"),
    try: () => decodeBase64(raw.startsWith("whsec_") ? raw.slice(6) : raw),
  });
  const key = yield* Effect.tryPromise({
    catch: infrastructure("webhook.importKey"),
    try: () =>
      crypto.subtle.importKey(
        "raw",
        keyBytes,
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign"]
      ),
  });
  const digest = yield* Effect.tryPromise({
    catch: infrastructure("webhook.sign"),
    try: () =>
      crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${id}.${timestamp}.${body}`)
      ),
  });
  return encodeBase64(digest);
});

/**
 * Verifies a Svix-signed webhook (Autumn delivers through Svix): HMAC-SHA256
 * over `${svix-id}.${svix-timestamp}.${body}` with the endpoint's `whsec_`
 * secret, any `v1,` signature in `svix-signature` matching, and a timestamp
 * within five minutes of now. Resolves to false for any mismatch.
 */
export const verifySvixSignature = Effect.fn("verifySvixSignature")(function* (
  secret: Redacted.Redacted<string>,
  headers: Headers,
  body: string
): Effect.fn.Return<boolean, InfrastructureError> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!(id && timestamp && signatures)) {
    return false;
  }
  const sentAt = Number(timestamp);
  const nowSeconds = Math.floor(
    (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) / 1000
  );
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS
  ) {
    return false;
  }
  const expected = yield* signWebhook(secret, id, timestamp, body);
  return signatures
    .split(" ")
    .map((entry) => entry.split(","))
    .some(
      ([version, signature]) =>
        version === "v1" &&
        signature !== undefined &&
        constantTimeEqual(signature, expected)
    );
});
