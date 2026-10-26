import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AnalyticsEngine } from "@server/platform/analytics-engine";
import { AppConfig } from "@server/platform/config";
import type { EventValue } from "@shared/event-value";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** One Product Event as persisted. `metadata`/`tags` are JSON-encoded. */
export interface StoredEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly title: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly tags: string;
  readonly metadata: string;
  readonly userId: string | null;
  readonly source: string;
  readonly displayAs: "message" | "notification";
  readonly notify: boolean;
  readonly createdAtMs: number;
  /** Top-level money in `metadata` (see `@shared/event-value`), extracted at ingest. */
  readonly value: EventValue | null;
}

/** Scan order: newest first, then by id (descending) within a millisecond. */
const newestFirst = (a: StoredEvent, b: StoredEvent) => {
  if (a.createdAtMs !== b.createdAtMs) {
    return b.createdAtMs - a.createdAtMs;
  }
  // Code-unit order, like SQL's `id <`, which the page cursor relies on.
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
};

export interface EventScan {
  readonly organizationId: string;
  /** Only events of these projects (the organization's live projects). */
  readonly projectIds: readonly string[];
  /** Only the event with this id. */
  readonly id?: string | undefined;
  readonly channelId?: string | undefined;
  readonly source?: string | undefined;
  readonly search?: string | undefined;
  /**
   * Only events before this point, newest first: earlier than `ms`, or at
   * `ms` with a smaller id (a page cursor, so events sharing a millisecond
   * are neither skipped nor repeated).
   */
  readonly before?:
    | { readonly ms: number; readonly id?: string | undefined }
    | undefined;
  /** Only events at or after this time. */
  readonly sinceMs?: number | undefined;
  readonly excludeIds: readonly string[];
  readonly excludeChannelIds: readonly string[];
  readonly limit: number;
}

/**
 * Counts and value sums in `buckets` consecutive buckets of `bucketMs`,
 * starting at `fromMs` (bucket i covers [fromMs + i·bucketMs, +bucketMs)).
 */
export interface SeriesRequest {
  readonly organizationId: string;
  readonly projectIds: readonly string[];
  readonly channelId?: string | undefined;
  readonly excludeIds: readonly string[];
  readonly excludeChannelIds: readonly string[];
  readonly fromMs: number;
  readonly bucketMs: number;
  readonly buckets: number;
}

export interface CurrencySeries {
  /** Events that carried a value in this currency. */
  readonly events: number;
  /** Summed amounts per bucket. */
  readonly sums: readonly number[];
}

export interface EventSeries {
  /** Events per bucket. */
  readonly counts: readonly number[];
  readonly values: ReadonlyMap<string, CurrencySeries>;
}

const emptySeries = (buckets: number): EventSeries => ({
  counts: Array.from({ length: buckets }, () => 0),
  values: new Map(),
});

/** Adds `amount` to bucket `index` of `currency`, creating the series on first use. */
const addValue = (
  values: Map<string, { events: number; sums: number[] }>,
  buckets: number,
  currency: string,
  index: number,
  amount: number,
  events: number
) => {
  const series = values.get(currency) ?? {
    events: 0,
    sums: Array.from({ length: buckets }, () => 0),
  };
  series.sums[index] = (series.sums[index] ?? 0) + amount;
  series.events += events;
  values.set(currency, series);
};

/** Analytics Engine allows 16 KB of blobs per data point; D1 applies the same cap. */
export const MAX_EVENT_BYTES = 16_000;
export const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

export const eventBytes = (event: StoredEvent) => {
  const encoder = new TextEncoder();
  const parts = [
    event.id,
    event.projectId,
    event.channelId,
    event.title,
    event.description ?? "",
    event.icon ?? "",
    event.tags,
    event.metadata,
    event.userId ?? "",
    event.source,
    event.displayAs,
    event.channelName,
  ];
  return parts.reduce(
    (total, part) => total + encoder.encode(part).byteLength,
    0
  );
};

/**
 * Where Product Events live. Production uses Workers Analytics Engine
 * (write-only binding + SQL API reads, ~90 day retention); local development
 * and simple self-hosting use the D1 `event` table. Selected by EVENT_STORE.
 */
export class EventStore extends Context.Service<
  EventStore,
  {
    readonly append: (
      event: StoredEvent
    ) => Effect.Effect<void, InfrastructureError>;
    readonly scan: (
      scan: EventScan
    ) => Effect.Effect<readonly StoredEvent[], InfrastructureError>;
    readonly series: (
      request: SeriesRequest
    ) => Effect.Effect<EventSeries, InfrastructureError>;
    /** Removes events older than the retention window (no-op where the store expires data itself). */
    readonly expire: (
      nowMs: number
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/events/EventStore") {}

const DisplayAsSchema = Schema.Literals(["message", "notification"]);
const decodeDisplayAs = (value: string) =>
  Schema.decodeUnknownOption(DisplayAsSchema)(value).pipe((option) =>
    option._tag === "Some" ? option.value : "message"
  );

const nullIfEmpty = (value: string) => (value === "" ? null : value);

// ---------------------------------------------------------------------------
// D1

const D1Row = Schema.Struct({
  channel_id: Schema.String,
  channel_name: Schema.String,
  created_at_ms: Schema.Number,
  description: Schema.NullOr(Schema.String),
  display_as: Schema.String,
  icon: Schema.NullOr(Schema.String),
  id: Schema.String,
  metadata: Schema.String,
  notify: Schema.Number,
  organization_id: Schema.String,
  project_id: Schema.String,
  source: Schema.String,
  tags: Schema.String,
  title: Schema.String,
  user_id: Schema.NullOr(Schema.String),
  value_amount: Schema.NullOr(Schema.Number),
  value_currency: Schema.NullOr(Schema.String),
});

const fromD1Row = (row: typeof D1Row.Type): StoredEvent => ({
  channelId: row.channel_id,
  channelName: row.channel_name,
  createdAtMs: row.created_at_ms,
  description: row.description,
  displayAs: decodeDisplayAs(row.display_as),
  icon: row.icon,
  id: row.id,
  metadata: row.metadata,
  notify: row.notify === 1,
  organizationId: row.organization_id,
  projectId: row.project_id,
  source: row.source,
  tags: row.tags,
  title: row.title,
  userId: row.user_id,
  value:
    row.value_amount === null || row.value_currency === null
      ? null
      : { amount: row.value_amount, currency: row.value_currency },
});

/** D1 event table; keeps events for `retentionMs`. */
const makeD1Store = (retentionMs: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const decodeRows = Schema.decodeUnknownEffect(Schema.Array(D1Row));

    const append = Effect.fn("EventStore.d1.append")(function* (
      event: StoredEvent
    ) {
      yield* sql`insert into event ${sql.insert({
        channel_id: event.channelId,
        channel_name: event.channelName,
        created_at_ms: event.createdAtMs,
        description: event.description,
        display_as: event.displayAs,
        icon: event.icon,
        id: event.id,
        metadata: event.metadata,
        notify: event.notify ? 1 : 0,
        organization_id: event.organizationId,
        project_id: event.projectId,
        source: event.source,
        tags: event.tags,
        title: event.title,
        user_id: event.userId,
        value_amount: event.value?.amount ?? null,
        value_currency: event.value?.currency ?? null,
      })}`.pipe(Effect.mapError(infrastructure("events.d1.append")));
    });

    const scan = Effect.fn("EventStore.d1.scan")(function* (query: EventScan) {
      if (query.projectIds.length === 0) {
        return [];
      }
      const nowMs = yield* Clock.currentTimeMillis;
      const conditions = [
        sql`organization_id = ${query.organizationId}`,
        sql.in("project_id", query.projectIds),
        sql`created_at_ms > ${nowMs - RETENTION_DAYS * DAY_MS}`,
      ];
      if (query.id !== undefined) {
        conditions.push(sql`id = ${query.id}`);
      }
      if (query.channelId) {
        conditions.push(sql`channel_id = ${query.channelId}`);
      }
      if (query.source) {
        conditions.push(sql`source = ${query.source}`);
      }
      if (query.search) {
        conditions.push(
          sql`(instr(lower(title), ${query.search.toLowerCase()}) > 0 or instr(lower(coalesce(description, '')), ${query.search.toLowerCase()}) > 0)`
        );
      }
      if (query.before !== undefined) {
        conditions.push(
          query.before.id === undefined
            ? sql`created_at_ms < ${query.before.ms}`
            : sql`(created_at_ms < ${query.before.ms} or (created_at_ms = ${query.before.ms} and id < ${query.before.id}))`
        );
      }
      if (query.sinceMs !== undefined) {
        conditions.push(sql`created_at_ms >= ${query.sinceMs}`);
      }
      if (query.excludeIds.length > 0) {
        conditions.push(sql`id not in ${sql.in(query.excludeIds)}`);
      }
      if (query.excludeChannelIds.length > 0) {
        conditions.push(
          sql`channel_id not in ${sql.in(query.excludeChannelIds)}`
        );
      }
      const rows =
        yield* sql`select * from event where ${sql.and(conditions)} order by created_at_ms desc, id desc limit ${query.limit}`.pipe(
          Effect.mapError(infrastructure("events.d1.scan"))
        );
      const decoded = yield* decodeRows(rows).pipe(
        Effect.mapError(infrastructure("events.d1.decode"))
      );
      return decoded.map(fromD1Row);
    });

    const SeriesRow = Schema.Struct({
      bucket: Schema.Number,
      currency: Schema.NullOr(Schema.String),
      events: Schema.Number,
      total: Schema.NullOr(Schema.Number),
    });
    const decodeSeriesRows = Schema.decodeUnknownEffect(
      Schema.Array(SeriesRow)
    );

    const series = Effect.fn("EventStore.d1.series")(function* (
      request: SeriesRequest
    ) {
      const result = emptySeries(request.buckets);
      if (request.projectIds.length === 0 || request.buckets <= 0) {
        return result;
      }
      const fromMs = Math.floor(request.fromMs);
      const bucketMs = Math.floor(request.bucketMs);
      const conditions = [
        sql`organization_id = ${request.organizationId}`,
        sql.in("project_id", request.projectIds),
        sql`created_at_ms >= ${fromMs}`,
        sql`created_at_ms < ${fromMs + bucketMs * request.buckets}`,
      ];
      if (request.channelId) {
        conditions.push(sql`channel_id = ${request.channelId}`);
      }
      if (request.excludeIds.length > 0) {
        conditions.push(sql`id not in ${sql.in(request.excludeIds)}`);
      }
      if (request.excludeChannelIds.length > 0) {
        conditions.push(
          sql`channel_id not in ${sql.in(request.excludeChannelIds)}`
        );
      }
      const rows = yield* sql`
        select
          (created_at_ms - ${fromMs}) / ${bucketMs} as bucket,
          value_currency as currency,
          count(*) as events,
          sum(value_amount) as total
        from event where ${sql.and(conditions)}
        group by bucket, currency`.pipe(
        Effect.mapError(infrastructure("events.d1.series"))
      );
      const decoded = yield* decodeSeriesRows(rows).pipe(
        Effect.mapError(infrastructure("events.d1.series.decode"))
      );
      const counts = [...result.counts];
      const values = new Map<string, { events: number; sums: number[] }>();
      for (const row of decoded) {
        const index = Math.trunc(row.bucket);
        if (index < 0 || index >= request.buckets) {
          continue;
        }
        counts[index] = (counts[index] ?? 0) + row.events;
        if (row.currency !== null) {
          addValue(
            values,
            request.buckets,
            row.currency,
            index,
            row.total ?? 0,
            row.events
          );
        }
      }
      return { counts, values };
    });

    const expire = Effect.fn("EventStore.d1.expire")(function* (nowMs: number) {
      const result = yield* sql<{
        readonly id: string;
      }>`delete from event where created_at_ms < ${nowMs - retentionMs} returning id`.pipe(
        Effect.mapError(infrastructure("events.d1.expire"))
      );
      return result.length;
    });

    return EventStore.of({ append, expire, scan, series });
  });

// ---------------------------------------------------------------------------
// Analytics Engine
//
// Layout of one data point (positions are part of the storage contract):
//   index1  organizationId (sampling key)
//   blob1 id, blob2 projectId, blob3 channelId, blob4 title, blob5 description,
//   blob6 icon, blob7 tags JSON, blob8 metadata JSON, blob9 userId,
//   blob10 source, blob11 displayAs, blob12 channelName,
//   blob13 value currency ("" when the event carries no value)
//   double1 createdAtMs, double2 notify (0|1), double3 value amount (0 when none)
// blob13/double3 were added later: older points read as "" and 0 (no value).

const SAFE_ID = /^[A-Za-z0-9_-]+$/u;

/** Analytics Engine SQL has no bind parameters: only validated ids and stripped text are interpolated. */
const literal = (value: string) =>
  `'${value.replaceAll("\\", "").replaceAll("'", "")}'`;
const idLiteral = (value: string) =>
  SAFE_ID.test(value) ? `'${value}'` : "''";
const idList = (values: readonly string[]) =>
  values
    .filter((value) => SAFE_ID.test(value))
    .map(idLiteral)
    .join(", ");

const aeScope = (organizationId: string, projectIds: readonly string[]) =>
  `index1 = ${idLiteral(organizationId)} AND blob2 IN (${idList(projectIds)}) AND timestamp > NOW() - INTERVAL '${RETENTION_DAYS + 1}' DAY`;

const AeRow = Schema.Struct({
  blob1: Schema.String,
  blob10: Schema.String,
  blob11: Schema.String,
  blob12: Schema.String,
  blob13: Schema.String,
  blob2: Schema.String,
  blob3: Schema.String,
  blob4: Schema.String,
  blob5: Schema.String,
  blob6: Schema.String,
  blob7: Schema.String,
  blob8: Schema.String,
  blob9: Schema.String,
  double1: Schema.Number,
  double2: Schema.Number,
  double3: Schema.Number,
  index1: Schema.String,
});

/** Analytics Engine serialises 64-bit integers (e.g. SUM results) as JSON strings. */
const AeNumber = Schema.Union([Schema.Number, Schema.FiniteFromString]);

const AeResponse = <S extends Schema.Top>(row: S) =>
  Schema.Struct({ data: Schema.Array(row) });

const fromAeRow = (row: typeof AeRow.Type): StoredEvent => ({
  channelId: row.blob3,
  channelName: row.blob12,
  createdAtMs: row.double1,
  description: nullIfEmpty(row.blob5),
  displayAs: decodeDisplayAs(row.blob11),
  icon: nullIfEmpty(row.blob6),
  id: row.blob1,
  metadata: row.blob8 === "" ? "{}" : row.blob8,
  notify: row.double2 === 1,
  organizationId: row.index1,
  projectId: row.blob2,
  source: row.blob10,
  tags: row.blob7 === "" ? "[]" : row.blob7,
  title: row.blob4,
  userId: nullIfEmpty(row.blob9),
  value:
    row.blob13 === "" ? null : { amount: row.double3, currency: row.blob13 },
});

/** Workers Analytics Engine; the dataset expires data itself (~90 days). */
const makeAnalyticsEngineStore = Effect.gen(function* () {
  const engine = yield* AnalyticsEngine;
  const { dataset } = engine;

  const query = <S extends Schema.Top>(statement: string, row: S) =>
    engine.sql(statement).pipe(
      Effect.flatMap((text) =>
        Schema.decodeUnknownEffect(Schema.fromJsonString(AeResponse(row)))(
          text
        ).pipe(Effect.mapError(infrastructure("events.ae.decode")))
      ),
      Effect.map((parsed) => parsed.data),
      Effect.withSpan("EventStore.ae.query")
    );

  const append = Effect.fn("EventStore.ae.append")(function* (
    event: StoredEvent
  ) {
    yield* engine.write({
      blobs: [
        event.id,
        event.projectId,
        event.channelId,
        event.title,
        event.description ?? "",
        event.icon ?? "",
        event.tags,
        event.metadata,
        event.userId ?? "",
        event.source,
        event.displayAs,
        event.channelName,
        event.value?.currency ?? "",
      ],
      doubles: [
        event.createdAtMs,
        event.notify ? 1 : 0,
        event.value?.amount ?? 0,
      ],
      indexes: [event.organizationId],
    });
  });

  const scan = Effect.fn("EventStore.ae.scan")(function* (request: EventScan) {
    if (request.projectIds.length === 0) {
      return [];
    }
    const conditions = [aeScope(request.organizationId, request.projectIds)];
    if (request.id !== undefined) {
      conditions.push(`blob1 = ${idLiteral(request.id)}`);
    }
    if (request.channelId) {
      conditions.push(`blob3 = ${idLiteral(request.channelId)}`);
    }
    if (request.source) {
      conditions.push(`blob10 = ${literal(request.source)}`);
    }
    if (request.search) {
      const needle = literal(request.search.toLowerCase());
      conditions.push(
        `(position(${needle} IN lowerUTF8(blob4)) > 0 OR position(${needle} IN lowerUTF8(blob5)) > 0)`
      );
    }
    if (request.before !== undefined) {
      const ms = Math.floor(request.before.ms);
      conditions.push(
        request.before.id === undefined
          ? `double1 < ${ms}`
          : `(double1 < ${ms} OR (double1 = ${ms} AND blob1 < ${idLiteral(request.before.id)}))`
      );
    }
    if (request.sinceMs !== undefined) {
      conditions.push(`double1 >= ${Math.floor(request.sinceMs)}`);
    }
    if (request.excludeIds.length > 0) {
      conditions.push(`blob1 NOT IN (${idList(request.excludeIds)})`);
    }
    if (request.excludeChannelIds.length > 0) {
      conditions.push(`blob3 NOT IN (${idList(request.excludeChannelIds)})`);
    }
    const rows = yield* query(
      `SELECT index1, blob1, blob2, blob3, blob4, blob5, blob6, blob7, blob8, blob9, blob10, blob11, blob12, blob13, double1, double2, double3 FROM ${dataset} WHERE ${conditions.join(" AND ")} ORDER BY double1 DESC, blob1 DESC LIMIT ${Math.floor(request.limit)}`,
      AeRow
    );
    return rows.map(fromAeRow);
  });

  /*
   * One row per currency ("" = no value), one column pair per bucket. Uses
   * only constructs `scan` already relies on (IF, SUM, _sample_interval,
   * GROUP BY a blob): counts are sample-weighted estimates.
   */
  const series = Effect.fn("EventStore.ae.series")(function* (
    request: SeriesRequest
  ) {
    const result = emptySeries(request.buckets);
    if (request.projectIds.length === 0 || request.buckets <= 0) {
      return result;
    }
    const fromMs = Math.floor(request.fromMs);
    const bucketMs = Math.floor(request.bucketMs);
    const indexes = Array.from({ length: request.buckets }, (_, i) => i);
    const inBucket = (i: number) =>
      `double1 >= ${fromMs + i * bucketMs} AND double1 < ${fromMs + (i + 1) * bucketMs}`;
    // IF() needs both branches of one type: `_sample_interval * double3` is a
    // Double, so its fallback is `0.0` (Analytics Engine rejects `0` with 422).
    const columns = indexes.flatMap((i) => [
      `SUM(IF(${inBucket(i)}, _sample_interval, 0)) AS c${i}`,
      `SUM(IF(${inBucket(i)}, _sample_interval * double3, 0.0)) AS v${i}`,
    ]);
    const conditions = [
      aeScope(request.organizationId, request.projectIds),
      `double1 >= ${fromMs}`,
      `double1 < ${fromMs + request.buckets * bucketMs}`,
    ];
    if (request.channelId) {
      conditions.push(`blob3 = ${idLiteral(request.channelId)}`);
    }
    if (request.excludeIds.length > 0) {
      conditions.push(`blob1 NOT IN (${idList(request.excludeIds)})`);
    }
    if (request.excludeChannelIds.length > 0) {
      conditions.push(`blob3 NOT IN (${idList(request.excludeChannelIds)})`);
    }
    const cellFields: Record<string, typeof AeNumber> = Object.fromEntries(
      indexes.flatMap((i): [string, typeof AeNumber][] => [
        [`c${i}`, AeNumber],
        [`v${i}`, AeNumber],
      ])
    );
    const decodeCurrency = Schema.decodeUnknownEffect(
      Schema.Struct({ currency: Schema.String })
    );
    const decodeCells = Schema.decodeUnknownEffect(Schema.Struct(cellFields));
    const rows = yield* query(
      `SELECT blob13 AS currency, ${columns.join(", ")} FROM ${dataset} WHERE ${conditions.join(" AND ")} GROUP BY currency LIMIT 100`,
      Schema.Unknown
    );
    const counts = [...result.counts];
    const values = new Map<string, { events: number; sums: number[] }>();
    for (const row of rows) {
      const [{ currency }, cells] = yield* Effect.all([
        decodeCurrency(row),
        decodeCells(row),
      ]).pipe(Effect.mapError(infrastructure("events.ae.series.decode")));
      for (const i of indexes) {
        const events = cells[`c${i}`] ?? 0;
        counts[i] = (counts[i] ?? 0) + events;
        if (currency !== "") {
          addValue(
            values,
            request.buckets,
            currency,
            i,
            cells[`v${i}`] ?? 0,
            events
          );
        }
      }
    }
    return { counts, values };
  });

  return EventStore.of({
    append,
    expire: () => Effect.succeed(0),
    scan,
    series,
  });
});

/**
 * Analytics Engine becomes queryable ~1 minute after a write, too slow for a
 * live feed. Every event is therefore also written to a 25-hour D1 hot
 * buffer: reads merge both (deduplicated by id), and the last-24-hour stats
 * come from the buffer, which is exact and immediate.
 */
const HOT_WINDOW_MS = 25 * 60 * 60 * 1000;

const makeHybridStore = Effect.gen(function* () {
  const hot = yield* makeD1Store(HOT_WINDOW_MS);
  const cold = yield* makeAnalyticsEngineStore;

  const append = Effect.fn("EventStore.hybrid.append")(function* (
    event: StoredEvent
  ) {
    yield* Effect.all([hot.append(event), cold.append(event)], {
      concurrency: 2,
      discard: true,
    });
  });

  const scan = Effect.fn("EventStore.hybrid.scan")(function* (
    request: EventScan
  ) {
    // One event: the hot buffer answers recent ids without an Analytics Engine query.
    if (request.id !== undefined) {
      const recent = yield* hot.scan(request);
      return recent.length > 0 ? recent : yield* cold.scan(request);
    }
    const [recent, archived] = yield* Effect.all(
      [hot.scan(request), cold.scan(request)],
      { concurrency: 2 }
    );
    const byId = new Map<string, StoredEvent>();
    for (const event of [...recent, ...archived]) {
      if (!byId.has(event.id)) {
        byId.set(event.id, event);
      }
    }
    return [...byId.values()].toSorted(newestFirst).slice(0, request.limit);
  });

  /*
   * Buckets that start within the last 24 hours come from the hot buffer
   * (exact, immediate); older ones from Analytics Engine (sampled, complete
   * after about a minute). The pulse's bucket sizes (1h, 6h, 1d) all divide
   * 24h, so no bucket straddles the boundary.
   */
  const series = Effect.fn("EventStore.hybrid.series")(function* (
    request: SeriesRequest
  ) {
    const nowMs = yield* Clock.currentTimeMillis;
    const cutoffMs = nowMs - DAY_MS;
    const split = Math.min(
      request.buckets,
      // Rounding down hands a bucket that starts within a clock tick of
      // the cutoff to the hot buffer, which holds 25 hours.
      Math.max(0, Math.floor((cutoffMs - request.fromMs) / request.bucketMs))
    );
    const [archived, recent] = yield* Effect.all(
      [
        cold.series({ ...request, buckets: split }),
        hot.series({
          ...request,
          buckets: request.buckets - split,
          fromMs: request.fromMs + split * request.bucketMs,
        }),
      ],
      { concurrency: 2 }
    );
    const values = new Map<string, { events: number; sums: number[] }>();
    const merge = (part: EventSeries, offset: number) => {
      for (const [currency, value] of part.values) {
        for (const [i, sum] of value.sums.entries()) {
          addValue(values, request.buckets, currency, offset + i, sum, 0);
        }
        addValue(values, request.buckets, currency, offset, 0, value.events);
      }
    };
    merge(archived, 0);
    merge(recent, split);
    return {
      counts: [...archived.counts, ...recent.counts],
      values,
    };
  });

  return EventStore.of({ append, expire: hot.expire, scan, series });
});

/** Picks the event store from EVENT_STORE (see docs/content/self-hosting/architecture.md). */
export const EventStoreLive: Layer.Layer<
  EventStore,
  never,
  AppConfig | AnalyticsEngine | SqlClient.SqlClient
> = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const selected: Layer.Layer<
      EventStore,
      never,
      AnalyticsEngine | SqlClient.SqlClient
    > =
      config.eventStore === "analytics-engine"
        ? Layer.effect(EventStore, makeHybridStore)
        : Layer.effect(EventStore, makeD1Store(RETENTION_DAYS * DAY_MS));
    return selected;
  })
);
