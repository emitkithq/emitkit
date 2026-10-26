import type { Schema } from "effect";

/** JSON text for values already typed as JSON (response bodies, stored receipts). */
export const stringifyJson = (value: Schema.Json): string =>
  JSON.stringify(value);
