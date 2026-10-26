import { RichText } from "@app/features/events/rich-text";
import { formatNumber } from "@app/lib/format";
import { Chip } from "@heroui/react";
import type { EventValue } from "@shared/event-value";
import { moneyOf } from "@shared/event-value";
import { cn } from "@ui/cn";
import { useState } from "react";

const WHOLE_URL = /^https?:\/\/\S+$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/u;
const KEY_SEPARATORS = /[_-]+/gu;
const CAMEL_HUMPS = /(?<upper>[A-Z]|\d+)/gu;
const FIRST_CHARACTER = /^./u;
const UNIT_SUFFIX = / (?:Ms|Bytes|At)$/u;
const URL_SUFFIX = / Url$/u;
const IDENTIFIER_KEY = /(?:^id$|Id$|^order$|Number$)/u;
const TRUNCATE_LENGTH = 120;

/** `cardLast4` reads "Card last 4"; unit suffixes are dropped (the value shows the unit). */
const humanizeKey = (key: string): string =>
  key
    .replace(KEY_SEPARATORS, " ")
    .replace(CAMEL_HUMPS, " $<upper>")
    .replace(FIRST_CHARACTER, (character) => character.toUpperCase())
    .replace(UNIT_SUFFIX, "")
    .replace(URL_SUFFIX, " URL")
    .trim();

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const formatBytes = (value: number): string => {
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < BYTE_UNITS.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
};

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Keys for a metadata array's items. The same string twice is legitimately
 * the same content, so the occurrence count disambiguates repeats.
 */
const toRenderableItems = (
  values: readonly unknown[]
): { key: string; label: string }[] => {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const label =
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value);
    const seen = occurrences.get(label) ?? 0;
    occurrences.set(label, seen + 1);
    return { key: `${label}#${seen}`, label };
  });
};

/** An amount in its currency; `signed` shows "+" on positive amounts too. */
export const Money = ({
  className,
  signed = false,
  value,
}: {
  className?: string;
  signed?: boolean;
  value: EventValue;
}) => (
  <span className={cn("tabular-nums", className)}>
    {formatNumber(value.amount, {
      currency: value.currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(value.amount) ? 0 : 2,
      signDisplay: signed ? "exceptZero" : "auto",
      style: "currency",
    })}
  </span>
);

const isLongText = (value: string) =>
  value.includes("\n") || value.length > TRUNCATE_LENGTH;

const LongText = ({ value }: { value: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = value.length > 600;
  return (
    <div className="mt-1">
      <pre className="bg-default-soft text-foreground/80 text-meta overflow-x-auto rounded-xl p-3 font-mono leading-relaxed whitespace-pre">
        {isLong && !isExpanded ? `${value.slice(0, 600)}…` : value}
      </pre>
      {isLong ? (
        <button
          className="text-accent-soft-foreground text-caption mt-1 font-medium hover:underline"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          {isExpanded ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
};

const MetadataString = ({ value }: { value: string }) => {
  if (ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))) {
    return (
      <time dateTime={value}>{timestampFormatter.format(new Date(value))}</time>
    );
  }
  if (isLongText(value) && !WHOLE_URL.test(value)) {
    return <LongText value={value} />;
  }
  return (
    <span className="break-words">
      <RichText value={value} />
    </span>
  );
};

const MetadataNumber = ({ name, value }: { name: string; value: number }) => {
  if (name.endsWith("Ms")) {
    return <span className="tabular-nums">{formatDuration(value)}</span>;
  }
  if (name.endsWith("Bytes")) {
    return <span className="tabular-nums">{formatBytes(value)}</span>;
  }
  if (name.endsWith("Rate") && value >= 0 && value <= 1) {
    return (
      <span className="tabular-nums">
        {formatNumber(value, { maximumFractionDigits: 1, style: "percent" })}
      </span>
    );
  }
  if (
    name === "rating" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  ) {
    return (
      <span aria-label={`${value} out of 5`} className="tracking-widest">
        <span className="text-warning">{"★".repeat(value)}</span>
        <span className="text-default">{"★".repeat(5 - value)}</span>
      </span>
    );
  }
  if (IDENTIFIER_KEY.test(name)) {
    return <span className="tabular-nums">{value}</span>;
  }
  return <span className="tabular-nums">{formatNumber(value)}</span>;
};

const MetadataValue = ({ name, value }: { name: string; value: unknown }) => {
  const money = moneyOf(value);
  if (money) {
    return <Money className="font-medium tabular-nums" value={money} />;
  }
  if (value === null || value === undefined) {
    return <span className="text-muted">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Chip color={value ? "success" : "default"} size="sm" variant="soft">
        {value ? "Yes" : "No"}
      </Chip>
    );
  }
  if (typeof value === "number") {
    return <MetadataNumber name={name} value={value} />;
  }
  if (typeof value === "string") {
    return <MetadataString value={value} />;
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {toRenderableItems(value).map((item) => (
          <Chip key={item.key} size="sm" variant="secondary">
            <RichText value={item.label} />
          </Chip>
        ))}
      </span>
    );
  }
  return (
    // oxlint-disable-next-line no-use-before-define -- nested objects render as metadata again (mutual recursion)
    <EventMetadata
      className="border-separator mt-1 border-l-2 pl-3"
      metadata={value as Readonly<Record<string, unknown>>}
    />
  );
};

/** Values that need the full width under their label rather than beside it. */
const isBlock = (value: unknown) =>
  moneyOf(value) === null &&
  ((typeof value === "string" && isLongText(value)) ||
    (typeof value === "object" && value !== null && !Array.isArray(value)));

/**
 * An event's `metadata`, rendered by the shape and name of each value:
 * money (`{ amount, currency }`), durations (`…Ms`), sizes (`…Bytes`),
 * ratios (`…Rate`), timestamps (`…At`), `rating`, links, emails, long text,
 * booleans, lists and nested objects. URLs, emails and bare domains inside
 * text become links with the brand's icon (see `RichText`).
 *
 * Note: The public API accepts any JSON here, so this renders untrusted
 * data: values are only ever placed as text, and links only ever point at
 * `http(s)://` or `mailto:` (see `RichText`).
 */
export const EventMetadata = ({
  className = "",
  metadata,
}: {
  className?: string;
  metadata: Readonly<Record<string, unknown>>;
}) => (
  <dl className={`text-body grid min-w-0 grid-cols-1 gap-y-2.5 ${className}`}>
    {Object.entries(metadata).map(([key, value]) =>
      isBlock(value) ? (
        <div className="min-w-0" key={key}>
          <dt className="text-muted wrap-anywhere">{humanizeKey(key)}</dt>
          <dd className="min-w-0">
            <MetadataValue name={key} value={value} />
          </dd>
        </div>
      ) : (
        <div
          className="grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3"
          key={key}
        >
          <dt className="text-muted wrap-anywhere">{humanizeKey(key)}</dt>
          <dd className="min-w-0">
            <MetadataValue name={key} value={value} />
          </dd>
        </div>
      )
    )}
  </dl>
);
