import { Effect } from "effect";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `<prefix>_<24 random chars>`, matching Better Auth ids in this codebase. */
export const makeId = (prefix: string) =>
  Effect.sync(() => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    let body = "";
    for (const byte of bytes) {
      body += ALPHABET[byte % ALPHABET.length];
    }
    return `${prefix}_${body}`;
  });

export const makeRequestId = Effect.sync(() => crypto.randomUUID());

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Hex SHA-256 of a UTF-8 string (idempotency fingerprints). */
export const sha256Hex = (value: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  ).pipe(Effect.map(toHex));
