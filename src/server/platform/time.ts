import { DateTime } from "effect";

/** An epoch-milliseconds instant as ISO 8601 (what the API and RPC send). */
export const toIso = (ms: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(ms));
