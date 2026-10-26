/**
 * Times and page cursors in event queries, parsed one way everywhere (the
 * API validates with these, the query runs with them).
 *
 * A time is ISO 8601 with its zone (`2026-09-26T10:00:00Z`, `…+02:00`) or
 * a date (`2026-09-26`, UTC midnight). A cursor is the last event's time
 * and id, `2026-09-26T10:00:00.000Z~event_…`, so events that share a
 * millisecond are neither skipped nor repeated; a plain time works too.
 */
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

const SEPARATOR = "~";

/** Epoch milliseconds, or undefined when it isn't a time with a zone. */
export const parseTime = (value: string): number | undefined => {
  if (!ISO_TIME.test(value)) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

export interface Cursor {
  readonly ms: number;
  /** Absent for a plain time. */
  readonly id?: string | undefined;
}

export const parseCursor = (value: string): Cursor | undefined => {
  const at = value.indexOf(SEPARATOR);
  const ms = parseTime(at === -1 ? value : value.slice(0, at));
  if (ms === undefined) {
    return undefined;
  }
  const id = at === -1 ? undefined : value.slice(at + 1);
  return id === "" ? undefined : { id, ms };
};

export const cursorOf = (ms: number, id: string) =>
  `${new Date(ms).toISOString()}${SEPARATOR}${id}`;
