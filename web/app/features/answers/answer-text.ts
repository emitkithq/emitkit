import { dateAndTime, formatNumber, plural } from "@app/lib/format";
import type { AnswerValue, Field } from "@shared/actions";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const STARTS_WITH_LETTER = /^\p{L}/u;
const MINUTE_MS = 60_000;

/** "10:30" today, "25 Sept, 10:30" on another day. */
export const timeText = (iso: string): string => {
  const at = new Date(iso);
  return at.toDateString() === new Date().toDateString()
    ? clockFormatter.format(at)
    : dateAndTime(iso);
};

/** "Expires in 25 min", "Expires in 3 h", "Expires in 5 days". */
export const expiresText = (expiresAt: string): string => {
  const minutes = Math.max(
    1,
    Math.round((Date.parse(expiresAt) - Date.now()) / MINUTE_MS)
  );
  if (minutes < 60) {
    return `Expires in ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48
    ? `Expires in ${hours} h`
    : `Expires in ${plural(Math.round(hours / 24), "day")}`;
};

/** "$240", "15%", "30 min": `$` goes before the number, other units after. */
export const withUnit = (value: number, unit: string | undefined): string => {
  const shown = formatNumber(value);
  if (!unit) {
    return shown;
  }
  if (unit === "$") {
    return `$${shown}`;
  }
  return STARTS_WITH_LETTER.test(unit) ? `${shown} ${unit}` : `${shown}${unit}`;
};

/** The unit shown before a number field's input ($), or after it (%, min). */
export const unitBefore = (unit: string | undefined) =>
  unit === "$" ? unit : null;
export const unitAfter = (unit: string | undefined) =>
  unit && unit !== "$" ? unit : null;

/** The option ids a choice value holds: one for a single choice, any for multiple. */
export const pickedIds = (
  value: AnswerValue | undefined
): readonly string[] => {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value : [];
};

/** A field's answer as a person reads it: option labels, Yes/No, a number with its unit. */
export const valueText = (
  field: Field,
  value: AnswerValue | undefined
): string => {
  if (value === undefined || value === "") {
    return "—";
  }
  switch (field.type) {
    case "choice": {
      const ids = pickedIds(value);
      const labels = field.options
        .filter((option) => ids.includes(option.id))
        .map((option) => option.label);
      return labels.length > 0 ? labels.join(", ") : "None";
    }
    case "boolean": {
      return value === true ? "Yes" : "No";
    }
    case "number": {
      return typeof value === "number"
        ? withUnit(value, field.unit)
        : String(value);
    }
    default: {
      return String(value);
    }
  }
};
