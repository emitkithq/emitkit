const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const countFormatter = new Intl.NumberFormat("en-US");

/** One `Intl.NumberFormat` per set of options: the feed formats a value per row. */
const numberFormatters = new Map<string, Intl.NumberFormat>();
const numberFormatter = (options?: Intl.NumberFormatOptions) => {
  const key = JSON.stringify(options ?? {});
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
};

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const dateAndTime = (iso: string): string =>
  dateTimeFormatter.format(new Date(iso));

export const calendarDate = (iso: string): string =>
  dateFormatter.format(new Date(iso));

export const formatClock = (iso: string): string =>
  clockFormatter.format(new Date(iso));

export const formatCount = (value: number): string =>
  countFormatter.format(value);

/**
 * A number, amount or ratio in the reader's locale (`Intl.NumberFormat`
 * options), for figures that follow the browser rather than a fixed format.
 */
export const formatNumber = (
  value: number,
  options?: Intl.NumberFormatOptions
): string => numberFormatter(options).format(value);

/**
 * "just now" / "48s ago" / "12m ago" / "3h ago", and a calendar date once the
 * moment is more than a day old.
 */
export const formatRelative = (iso: string, now: number): string => {
  const at = new Date(iso);
  const elapsed = Math.max(0, now - at.getTime());
  if (elapsed < 5 * SECOND_MS) {
    return "just now";
  }
  if (elapsed < MINUTE_MS) {
    return `${Math.round(elapsed / SECOND_MS)}s ago`;
  }
  if (elapsed < HOUR_MS) {
    return `${Math.round(elapsed / MINUTE_MS)}m ago`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.round(elapsed / HOUR_MS)}h ago`;
  }
  return dayFormatter.format(at);
};

export const plural = (
  count: number,
  singular: string,
  pluralForm = `${singular}s`
): string => `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
