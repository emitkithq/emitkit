import { Cards, NotWaitingError } from "@server/cards/cards";
import type { Answer, Answerer, Card, NewCard } from "@server/cards/cards";
import { Channels } from "@server/channels/channels";
import {
  describeFailure,
  ForbiddenError,
  infrastructure,
  NotFoundError,
} from "@server/errors";
import type {
  InfrastructureError,
  InvalidInputError,
  ConflictError,
} from "@server/errors";
import {
  EventStore,
  eventBytes,
  MAX_EVENT_BYTES,
} from "@server/events/event-store";
import type { StoredEvent } from "@server/events/event-store";
import { Identities } from "@server/identities/identities";
import type { JsonRecord } from "@server/identities/identities";
import { makeId } from "@server/platform/ids";
import { EventsQueue, MAX_DELAY_SECONDS } from "@server/platform/queue";
import { toIso } from "@server/platform/time";
import { Projects } from "@server/projects/projects";
import {
  answerButtons,
  DEFAULT_EXPIRES_IN,
  isLink,
  SUBMIT,
  waitsForAnswer,
} from "@shared/actions";
import type { Action, AnswerValues, Field } from "@shared/actions";
import { cursorOf, parseCursor, parseTime } from "@shared/cursor";
import { eventValue } from "@shared/event-value";
import type {
  EventPage,
  EventQuery,
  ProductEvent,
  Pulse,
  PulseQuery,
  PulseRange,
} from "@shared/rpc/schemas";
import {
  Clock,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Schedule,
  Schema,
} from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface EventInput {
  readonly channelName: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly icon?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly metadata?: JsonRecord | undefined;
  readonly userId?: string | null | undefined;
  readonly notify?: boolean | undefined;
  readonly source?: string | undefined;
  readonly displayAs?: "message" | "notification" | undefined;
  readonly fields?: readonly Field[] | undefined;
  readonly actions?: readonly Action[] | undefined;
  /** Seconds an event with buttons or fields waits for an answer. */
  readonly expiresIn?: number | undefined;
  readonly callbackUrl?: string | undefined;
  readonly resume?: string | undefined;
}

/** An event as the public API returns it: the stored event and its card, if any. */
export interface FoundEvent {
  readonly event: ProductEvent;
  readonly card: Card | null;
}

/** The stored event would exceed Analytics Engine's per-point budget. */
export class EventTooLargeError extends Schema.TaggedError<EventTooLargeError>()(
  "EventTooLargeError",
  {
    bytes: Schema.Number,
  }
) {}

const Tags = Schema.fromJsonString(Schema.Array(Schema.String));
const Metadata = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Json)
);
const encodeTags = Schema.encodeSync(Tags);
const encodeMetadata = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);
const decodeTags = (value: string) =>
  Schema.decodeUnknownOption(Tags)(value).pipe(
    Option.getOrElse((): readonly string[] => [])
  );
const decodeMetadata = (value: string) =>
  Schema.decodeUnknownOption(Metadata)(value).pipe(
    Option.getOrElse(() => ({}))
  );

const DEFAULT_PAGE = 50;

const HOUR_MS = 3_600_000;

/** Bucket size and count per pulse range; each bucket size divides 24h. */
const PULSE_RANGES = {
  "24h": { bucketMs: HOUR_MS, buckets: 24 },
  "30d": { bucketMs: 24 * HOUR_MS, buckets: 30 },
  "7d": { bucketMs: 6 * HOUR_MS, buckets: 28 },
} satisfies Record<
  PulseRange,
  { readonly bucketMs: number; readonly buckets: number }
>;

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/**
 * Work after the event is stored. Failing the request here would make
 * a retry with the same Idempotency-Key write the event twice, so
 * these are retried briefly, then logged.
 */
const afterWrite = (
  operation: string,
  work: Effect.Effect<void, InfrastructureError>
) =>
  work.pipe(
    Effect.retry(Schedule.recurs(2)),
    Effect.catchTag("InfrastructureError", (failure) =>
      Effect.logError(
        `${operation} failed after the event was stored`,
        describeFailure(failure)
      )
    )
  );

/** What a new event asks: its card, and until when it waits (null: it doesn't). */
const questionOf = (input: EventInput, createdAtMs: number) => {
  const fields = input.fields ?? [];
  const actions = input.actions ?? [];
  const waits = waitsForAnswer(input);
  return {
    actions,
    expiresAtMs: waits
      ? createdAtMs + (input.expiresIn ?? DEFAULT_EXPIRES_IN) * 1000
      : null,
    fields,
    hasCard: fields.length > 0 || actions.length > 0,
    waits,
  };
};

/** A card just created, before anyone answered or anything was delivered. */
const cardOf = (
  { callbackUrl, ...snapshot }: NewCard,
  answer: Answer | null
): Card => ({
  ...snapshot,
  answer,
  callback:
    callbackUrl === null
      ? null
      : {
          attempts: 0,
          deliveredAtMs: null,
          lastStatus: null,
          url: callbackUrl,
        },
});

const pendingAnswer = (expiresAtMs: number | null): Answer | null =>
  expiresAtMs === null
    ? null
    : {
        action: null,
        atMs: null,
        by: null,
        expiresAtMs,
        status: "pending",
        values: null,
      };

/** A stored event as read back; a user erased after it happened is detached. */
const toProductEvent = (
  row: StoredEvent,
  erased: ReadonlyMap<string, number>
): ProductEvent => {
  const erasedAt = row.userId === null ? undefined : erased.get(row.userId);
  return {
    channelId: row.channelId,
    channelName: row.channelName,
    createdAt: toIso(row.createdAtMs),
    description: row.description,
    displayAs: row.displayAs,
    icon: row.icon,
    id: row.id,
    metadata: decodeMetadata(row.metadata),
    notify: row.notify,
    projectId: row.projectId,
    source: row.source,
    tags: decodeTags(row.tags),
    title: row.title,
    userId:
      erasedAt !== undefined && row.createdAtMs <= erasedAt ? null : row.userId,
    links: [],
    question: null,
  };
};

/** A feed event with what its card adds: its links, and its question's state. */
const withCard = (event: ProductEvent, card: Card | undefined): ProductEvent =>
  card
    ? {
        ...event,
        links: card.actions
          .filter(isLink)
          .map((link) => ({ label: link.label, url: link.url })),
        question: card.answer && {
          answeredBy: card.answer.by?.name ?? null,
          status: card.answer.status,
        },
      }
    : event;

/** Product Events: ingestion from the public API and reads for the dashboard. */
export class Events extends Context.Service<
  Events,
  {
    readonly ingest: (
      scope: {
        readonly organizationId: string;
        readonly projectId: string | null;
      },
      input: EventInput
    ) => Effect.Effect<
      FoundEvent,
      ForbiddenError | EventTooLargeError | InfrastructureError
    >;
    /**
     * One event of a live project, with its card. NotFound once it's past
     * retention, deleted, or in a deleted channel; Forbidden when the
     * project was deleted.
     */
    readonly get: (
      scope: { readonly organizationId: string; readonly projectId: string },
      id: string
    ) => Effect.Effect<
      FoundEvent,
      NotFoundError | ForbiddenError | InfrastructureError
    >;
    /** Stops an event of the project from waiting; a Conflict says why it can't. */
    readonly cancel: (
      scope: { readonly organizationId: string; readonly projectId: string },
      id: string
    ) => Effect.Effect<
      void,
      | NotFoundError
      | ForbiddenError
      | ConflictError
      | NotWaitingError
      | InfrastructureError
    >;
    /** Answers an event that waits, as a member, and records the answer as an event. */
    readonly answer: (
      answerer: Answerer,
      eventId: string,
      reply: { readonly action: string; readonly values: AnswerValues }
    ) => Effect.Effect<
      Card,
      NotFoundError | ConflictError | InvalidInputError | InfrastructureError
    >;
    /** A page of the feed, newest first. */
    readonly list: (
      organizationId: string,
      query: EventQuery
    ) => Effect.Effect<EventPage, InfrastructureError>;
    /** The same page, each event with its card (for the public API). */
    readonly page: (
      organizationId: string,
      query: EventQuery
    ) => Effect.Effect<
      {
        readonly found: readonly FoundEvent[];
        readonly nextCursor: string | null;
      },
      InfrastructureError
    >;
    readonly pulse: (
      organizationId: string,
      query: PulseQuery
    ) => Effect.Effect<Pulse, InfrastructureError>;
    readonly remove: (
      organizationId: string,
      id: string
    ) => Effect.Effect<void, InfrastructureError>;
    readonly expireTombstones: (
      cutoffIso: string
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/events/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = yield* EventStore;
      const projects = yield* Projects;
      const channels = yield* Channels;
      const identities = yield* Identities;
      const queue = yield* EventsQueue;
      const cards = yield* Cards;

      /**
       * What follows a stored event on the queue: its push, and for a
       * question with a callback, the check that expires it.
       */
      const queueWork = (event: StoredEvent, card: NewCard, waits: boolean) =>
        Effect.gen(function* () {
          if (card.expiresAtMs !== null && card.callbackUrl !== null) {
            yield* afterWrite(
              "queue.send expiry",
              queue.send(
                {
                  eventId: event.id,
                  organizationId: event.organizationId,
                  type: "answer.expire",
                },
                {
                  delaySeconds: Math.min(
                    MAX_DELAY_SECONDS,
                    Math.ceil((card.expiresAtMs - event.createdAtMs) / 1000)
                  ),
                }
              )
            );
          }
          if (event.notify || waits) {
            yield* afterWrite(
              "queue.send",
              queue.send({
                channelId: event.channelId,
                description: event.description,
                eventId: event.id,
                icon: event.icon,
                organizationId: event.organizationId,
                projectId: event.projectId,
                title: event.title,
                type: "event.created",
                waits,
              })
            );
          }
        });

      const ingest = Effect.fn("Events.ingest")(function* (
        scope: {
          readonly organizationId: string;
          readonly projectId: string | null;
        },
        input: EventInput
      ) {
        if (!scope.projectId) {
          return yield* new ForbiddenError({
            message: "API key is not bound to a project",
          });
        }
        const project = yield* projects
          .get(scope.organizationId, scope.projectId)
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(
                new ForbiddenError({ message: "Project was deleted" })
              )
            )
          );
        const channel = yield* channels.resolve(scope.organizationId, {
          description: input.description,
          icon: input.icon,
          name: input.channelName,
          projectId: project.id,
        });
        const userId =
          input.userId === undefined || input.userId === null
            ? null
            : yield* identities.canonical(scope.organizationId, input.userId);
        const createdAtMs = yield* Clock.currentTimeMillis;
        const metadata = input.metadata ?? {};
        const event: StoredEvent = {
          channelId: channel.id,
          channelName: channel.name,
          createdAtMs,
          description: input.description ?? null,
          displayAs: input.displayAs ?? "message",
          icon: input.icon ?? null,
          id: yield* makeId("event"),
          metadata: encodeMetadata(metadata),
          notify: input.notify ?? true,
          organizationId: scope.organizationId,
          projectId: project.id,
          source: input.source ?? "api",
          tags: encodeTags(input.tags ?? []),
          title: input.title,
          userId,
          value: eventValue(metadata),
        };
        const bytes = eventBytes(event);
        if (bytes > MAX_EVENT_BYTES) {
          return yield* new EventTooLargeError({ bytes });
        }
        const { actions, expiresAtMs, fields, hasCard, waits } = questionOf(
          input,
          createdAtMs
        );
        const newCard: NewCard = {
          actions,
          channelId: channel.id,
          channelName: channel.name,
          createdAtMs,
          description: event.description,
          eventId: event.id,
          expiresAtMs,
          fields,
          icon: event.icon,
          organizationId: scope.organizationId,
          projectId: project.id,
          callbackUrl: waits ? (input.callbackUrl ?? null) : null,
          resume: waits ? (input.resume ?? null) : null,
          title: event.title,
        };
        // The card first: an event that waits must never exist without it.
        if (hasCard) {
          yield* cards.create(newCard);
        }
        yield* store
          .append(event)
          .pipe(
            Effect.tapError(() =>
              hasCard
                ? Effect.ignore(cards.remove(scope.organizationId, event.id))
                : Effect.void
            )
          );
        if (project.firstEventAt === null) {
          yield* afterWrite(
            "markFirstEvent",
            projects.markFirstEvent(project.id)
          );
        }
        yield* queueWork(event, newCard, waits);
        return {
          card: hasCard ? cardOf(newCard, pendingAnswer(expiresAtMs)) : null,
          event: toProductEvent(event, new Map()),
        } satisfies FoundEvent;
      });

      const tombstones = (organizationId: string) =>
        sql<{ readonly event_id: string }>`
          select event_id from event_tombstone where organization_id = ${organizationId} order by deleted_at desc limit 1000
        `.pipe(
          Effect.map((rows) => rows.map((row) => row.event_id)),
          Effect.mapError(infrastructure("events.tombstones"))
        );

      const scopeProjects = Effect.fn("Events.scopeProjects")(function* (
        organizationId: string,
        projectId: string | undefined
      ) {
        const live = yield* projects.liveIds(organizationId);
        return projectId === undefined
          ? live
          : live.filter((id) => id === projectId);
      });

      const page = Effect.fn("Events.page")(function* (
        organizationId: string,
        query: EventQuery
      ) {
        const limit = query.limit ?? DEFAULT_PAGE;
        const [projectIds, excludeIds, deletedChannels, erased] =
          yield* Effect.all(
            [
              scopeProjects(organizationId, query.projectId),
              tombstones(organizationId),
              channels.deletedIds(organizationId),
              identities.erased(organizationId),
            ],
            { concurrency: 4 }
          );
        const rows = yield* store.scan({
          before:
            query.before === undefined ? undefined : parseCursor(query.before),
          excludeChannelIds: [...deletedChannels],
          channelId: query.channelId,
          excludeIds,
          limit: limit + 1,
          organizationId,
          projectIds,
          search: query.search?.trim() || undefined,
          sinceMs:
            query.since === undefined ? undefined : parseTime(query.since),
          source: query.source,
        });
        const shown = rows.slice(0, limit);
        const shownCards = yield* cards.forEvents(
          organizationId,
          shown.map((row) => row.id)
        );
        const last = shown.at(-1);
        return {
          found: shown.map((row): FoundEvent => ({
            card: shownCards.get(row.id) ?? null,
            event: toProductEvent(row, erased),
          })),
          nextCursor:
            rows.length > limit && last
              ? cursorOf(last.createdAtMs, last.id)
              : null,
        };
      });

      const list = (organizationId: string, query: EventQuery) =>
        page(organizationId, query).pipe(
          Effect.map(({ found, nextCursor }) => ({
            events: found.map(({ card, event }) =>
              withCard(event, card ?? undefined)
            ),
            nextCursor,
          }))
        );

      /** The project an API key works in, while it's live. */
      const liveProject = (scope: {
        readonly organizationId: string;
        readonly projectId: string;
      }) =>
        projects
          .get(scope.organizationId, scope.projectId)
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(
                new ForbiddenError({ message: "Project was deleted" })
              )
            )
          );

      const get = Effect.fn("Events.get")(function* (
        scope: { readonly organizationId: string; readonly projectId: string },
        id: string
      ) {
        yield* liveProject(scope);
        const [excludeIds, erased, deletedChannels, card] = yield* Effect.all(
          [
            tombstones(scope.organizationId),
            identities.erased(scope.organizationId),
            channels.deletedIds(scope.organizationId),
            cards.get(scope.organizationId, id),
          ],
          { concurrency: 4 }
        );
        const [row] = excludeIds.includes(id)
          ? []
          : yield* store.scan({
              excludeChannelIds: [],
              excludeIds: [],
              id,
              limit: 1,
              organizationId: scope.organizationId,
              projectIds: [scope.projectId],
            });
        if (!row || deletedChannels.has(row.channelId)) {
          return yield* new NotFoundError({ entity: "Event", id });
        }
        return {
          card: Option.getOrNull(card),
          event: toProductEvent(row, erased),
        } satisfies FoundEvent;
      });

      const cancel = Effect.fn("Events.cancel")(function* (
        scope: { readonly organizationId: string; readonly projectId: string },
        id: string
      ) {
        yield* liveProject(scope);
        yield* cards.cancel(scope.organizationId, scope.projectId, id).pipe(
          // No question to cancel: the event doesn't wait, or doesn't exist.
          Effect.catchTag("NotFoundError", () =>
            get(scope, id).pipe(
              Effect.andThen(
                new NotWaitingError({
                  message:
                    "This event doesn't wait for an answer, so there is nothing to cancel",
                })
              )
            )
          )
        );
      });

      /** Records an answer on the timeline, next to the question. */
      const recordAnswer = Effect.fn("Events.recordAnswer")(function* (
        card: Card,
        answerer: Answerer
      ) {
        const { answer } = card;
        if (!answer || answer.action === null) {
          return;
        }
        const button = answerButtons(card).find(
          (candidate) => candidate.id === answer.action
        );
        const recorded: StoredEvent = {
          channelId: card.channelId,
          channelName: card.channelName,
          createdAtMs: answer.atMs ?? (yield* Clock.currentTimeMillis),
          description: card.title,
          displayAs: "message",
          icon: "☑️",
          id: yield* makeId("event"),
          metadata: encodeMetadata({
            action: answer.action,
            eventId: card.eventId,
            values: answer.values ?? {},
          }),
          notify: false,
          organizationId: card.organizationId,
          projectId: card.projectId,
          source: "emitkit",
          tags: encodeTags([]),
          title:
            answer.action === SUBMIT || !button
              ? `${answerer.name} answered`
              : `${answerer.name} chose “${button.label}”`,
          userId: null,
          value: null,
        };
        // Long text answers can exceed an event's budget; the card keeps them.
        yield* store.append(
          eventBytes(recorded) > MAX_EVENT_BYTES
            ? {
                ...recorded,
                metadata: encodeMetadata({
                  action: answer.action,
                  eventId: card.eventId,
                }),
              }
            : recorded
        );
      });

      const answer = Effect.fn("Events.answer")(function* (
        answerer: Answerer,
        eventId: string,
        reply: { readonly action: string; readonly values: AnswerValues }
      ) {
        const card = yield* cards.answer(answerer, eventId, reply);
        if (card.callback) {
          yield* afterWrite(
            "queue.send callback",
            queue.send({
              attempt: 1,
              eventId: card.eventId,
              kind: "answered",
              organizationId: card.organizationId,
              type: "answer.callback",
            })
          );
        }
        yield* recordAnswer(card, answerer).pipe(
          Effect.catchTag("InfrastructureError", (failure) =>
            Effect.logError(
              "recording an answer failed",
              describeFailure(failure)
            )
          )
        );
        return card;
      });

      /*
       * The range and the one before it, in one series of 2n buckets ending
       * now. Value is summed in the currency most events carried; other
       * currencies are left out rather than added together.
       */
      const pulse = Effect.fn("Events.pulse")(function* (
        organizationId: string,
        query: PulseQuery
      ) {
        const { bucketMs, buckets } = PULSE_RANGES[query.range];
        const [projectIds, excludeIds, deletedChannels] = yield* Effect.all(
          [
            scopeProjects(organizationId, query.projectId),
            tombstones(organizationId),
            channels.deletedIds(organizationId),
          ],
          { concurrency: 3 }
        );
        const nowMs = yield* Clock.currentTimeMillis;
        const fromMs = nowMs - 2 * buckets * bucketMs;
        const series = yield* store.series({
          bucketMs,
          buckets: 2 * buckets,
          channelId: query.channelId,
          excludeChannelIds: [...deletedChannels],
          excludeIds,
          fromMs,
          organizationId,
          projectIds,
        });
        const [currency, value] =
          [...series.values.entries()].toSorted(
            ([leftCurrency, left], [rightCurrency, right]) =>
              right.events - left.events ||
              leftCurrency.localeCompare(rightCurrency)
          )[0] ?? [];
        const sums = value?.sums ?? [];
        return {
          bucketMs,
          events: {
            current: sum(series.counts.slice(buckets)),
            previous: sum(series.counts.slice(0, buckets)),
          },
          points: series.counts.slice(buckets).map((events, i) => ({
            at: toIso(fromMs + (buckets + i) * bucketMs),
            events,
            value: sums[buckets + i] ?? 0,
          })),
          range: query.range,
          value:
            currency === undefined
              ? null
              : {
                  current: sum(sums.slice(buckets)),
                  currency,
                  previous: sum(sums.slice(0, buckets)),
                },
        };
      });

      const remove = Effect.fn("Events.remove")(function* (
        organizationId: string,
        id: string
      ) {
        const timestamp = DateTime.formatIso(yield* DateTime.now);
        yield* sql`
          insert into event_tombstone ${sql.insert({ deleted_at: timestamp, event_id: id, organization_id: organizationId })}
          on conflict (organization_id, event_id) do nothing
        `.pipe(Effect.mapError(infrastructure("events.remove")));
        yield* cards.remove(organizationId, id);
      });

      const expireTombstones = Effect.fn("Events.expireTombstones")(function* (
        cutoffIso: string
      ) {
        const rows = yield* sql<{ readonly id: string }>`
          delete from event_tombstone where deleted_at < ${cutoffIso} returning event_id as id
        `.pipe(Effect.mapError(infrastructure("events.expireTombstones")));
        return rows.length;
      });

      return Events.of({
        answer,
        cancel,
        expireTombstones,
        get,
        ingest,
        list,
        page,
        pulse,
        remove,
      });
    })
  );
}
