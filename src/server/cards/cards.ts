import {
  ConflictError,
  InvalidInputError,
  infrastructure,
  NotFoundError,
} from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { toIso } from "@server/platform/time";
import { Action, AnswerValue, checkAnswer, Field } from "@shared/actions";
import type { AnswerStatus, AnswerValues } from "@shared/actions";
import type { AnswerCard } from "@shared/rpc/schemas";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** A new event's fields and actions, and when it stops waiting (null: it doesn't). */
export interface NewCard {
  readonly eventId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly title: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly fields: readonly Field[];
  readonly actions: readonly Action[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number | null;
  /** Where to POST the answer or the expiry, when the sender asked for it. */
  readonly callbackUrl: string | null;
  /** The sender's own state, echoed back in the callback and GET only. */
  readonly resume: string | null;
}

/** How delivery to the sender's `callbackUrl` went. */
export interface CallbackState {
  readonly url: string;
  readonly attempts: number;
  /** The receiver's last HTTP status; null when it couldn't be reached. */
  readonly lastStatus: number | null;
  readonly deliveredAtMs: number | null;
}

export interface Answer {
  readonly status: AnswerStatus;
  readonly expiresAtMs: number;
  readonly action: string | null;
  readonly values: AnswerValues | null;
  readonly by: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  } | null;
  readonly atMs: number | null;
}

/** An event's card: its fields and actions, and the answer when it waits for one. */
export interface Card extends Omit<NewCard, "expiresAtMs" | "callbackUrl"> {
  readonly answer: Answer | null;
  readonly callback: CallbackState | null;
}

/** Cancel on an event that doesn't wait for an answer. */
export class NotWaitingError extends Schema.TaggedError<NotWaitingError>()(
  "NotWaitingError",
  { message: Schema.String }
) {}

export interface Answerer {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

const Row = Schema.Struct({
  action: Schema.NullOr(Schema.String),
  actions: Schema.fromJsonString(Schema.Array(Action)),
  callback_attempts: Schema.Number,
  callback_delivered_at_ms: Schema.NullOr(Schema.Number),
  callback_last_status: Schema.NullOr(Schema.Number),
  callback_url: Schema.NullOr(Schema.String),
  answer_values: Schema.NullOr(
    Schema.fromJsonString(Schema.Record(Schema.String, AnswerValue))
  ),
  answered_at_ms: Schema.NullOr(Schema.Number),
  answered_by: Schema.NullOr(Schema.String),
  answered_by_email: Schema.NullOr(Schema.String),
  answered_by_name: Schema.NullOr(Schema.String),
  channel_id: Schema.String,
  channel_name: Schema.String,
  created_at_ms: Schema.Number,
  description: Schema.NullOr(Schema.String),
  event_id: Schema.String,
  expires_at_ms: Schema.NullOr(Schema.Number),
  fields: Schema.fromJsonString(Schema.Array(Field)),
  icon: Schema.NullOr(Schema.String),
  organization_id: Schema.String,
  project_id: Schema.String,
  resume: Schema.NullOr(Schema.String),
  status: Schema.NullOr(
    Schema.Literals(["pending", "answered", "canceled", "expired"])
  ),
  title: Schema.String,
});
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row));
const encodeFields = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Field))
);
const encodeActions = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Action))
);
const encodeValues = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, AnswerValue))
);

const toCard = (row: typeof Row.Type, nowMs: number): Card => {
  let answer: Answer | null = null;
  if (row.status !== null && row.expires_at_ms !== null) {
    const expired = row.status === "pending" && row.expires_at_ms <= nowMs;
    answer = {
      action: row.action,
      atMs: row.answered_at_ms,
      by:
        row.answered_by === null
          ? null
          : {
              email: row.answered_by_email ?? "",
              id: row.answered_by,
              name: row.answered_by_name ?? "",
            },
      expiresAtMs: row.expires_at_ms,
      status: expired ? "expired" : row.status,
      values: row.answer_values,
    };
  }
  return {
    actions: row.actions,
    answer,
    callback:
      row.callback_url === null
        ? null
        : {
            attempts: row.callback_attempts,
            deliveredAtMs: row.callback_delivered_at_ms,
            lastStatus: row.callback_last_status,
            url: row.callback_url,
          },
    channelId: row.channel_id,
    channelName: row.channel_name,
    createdAtMs: row.created_at_ms,
    description: row.description,
    eventId: row.event_id,
    fields: row.fields,
    icon: row.icon,
    organizationId: row.organization_id,
    projectId: row.project_id,
    resume: row.resume,
    title: row.title,
  };
};

/**
 * An answer as the API and callbacks report it: the same keys every time,
 * with `action`, `values`, `by` and `at` null until someone answers.
 */
export const answerJson = (
  eventId: string,
  answer: Answer,
  appUrl: string
) => ({
  action: answer.action,
  at: answer.atMs === null ? null : toIso(answer.atMs),
  by: answer.by,
  expiresAt: toIso(answer.expiresAtMs),
  status: answer.status,
  url: `${appUrl}/a/${eventId}`,
  values: answer.values,
});

/** A card as its answer page shows it. */
export const cardView = (card: Card): AnswerCard => ({
  actions: card.actions,
  answer: card.answer && {
    action: card.answer.action,
    at: card.answer.atMs === null ? null : toIso(card.answer.atMs),
    by: card.answer.by?.name ?? null,
    expiresAt: toIso(card.answer.expiresAtMs),
    status: card.answer.status,
    values: card.answer.values,
  },
  channelName: card.channelName,
  createdAt: toIso(card.createdAtMs),
  description: card.description,
  eventId: card.eventId,
  fields: card.fields,
  icon: card.icon,
  title: card.title,
});

/** Why an answer or a cancel can't happen any more, for people and agents alike. */
const settledMessage = (answer: Answer) => {
  switch (answer.status) {
    case "answered": {
      return `Already answered by ${answer.by?.name || "someone"}`;
    }
    case "expired": {
      return "Expired without an answer";
    }
    case "canceled": {
      return "Canceled: the sender no longer needs an answer";
    }
    default: {
      return "Still waiting for an answer";
    }
  }
};

/**
 * Event cards: the fields and actions sent with an event, kept next to the
 * event store, and the answer to events that wait for one. First answer
 * wins; expiry is decided when a card is read.
 */
export class Cards extends Context.Service<
  Cards,
  {
    readonly create: (
      card: NewCard
    ) => Effect.Effect<void, InfrastructureError>;
    readonly remove: (
      organizationId: string,
      eventId: string
    ) => Effect.Effect<void, InfrastructureError>;
    /** The card of an event in the organization, if it has one. */
    readonly get: (
      organizationId: string,
      eventId: string
    ) => Effect.Effect<Option.Option<Card>, InfrastructureError>;
    /** The card of an event in any organization the user belongs to. */
    readonly findForMember: (
      userId: string,
      eventId: string
    ) => Effect.Effect<Card, NotFoundError | InfrastructureError>;
    readonly answer: (
      answerer: Answerer,
      eventId: string,
      reply: { readonly action: string; readonly values: AnswerValues }
    ) => Effect.Effect<
      Card,
      NotFoundError | ConflictError | InvalidInputError | InfrastructureError
    >;
    /**
     * Stops a pending event from waiting (the sender no longer needs the
     * answer); an already canceled one is returned as is. NotFound when the
     * event has no question.
     */
    readonly cancel: (
      organizationId: string,
      projectId: string,
      eventId: string
    ) => Effect.Effect<
      Card,
      NotFoundError | ConflictError | InfrastructureError
    >;
    /**
     * Marks a card whose time is up as expired and returns it; none when it
     * was answered or canceled first, or its time isn't up. Safe to repeat.
     */
    readonly expireIfDue: (
      organizationId: string,
      eventId: string
    ) => Effect.Effect<Option.Option<Card>, InfrastructureError>;
    /** Records callback attempt `attempt` and what the receiver answered. */
    readonly recordDelivery: (
      eventId: string,
      attempt: number,
      delivery: { readonly status: number | null; readonly ok: boolean }
    ) => Effect.Effect<void, InfrastructureError>;
    /** The cards of these events, by event id (for the dashboard feed). */
    readonly forEvents: (
      organizationId: string,
      eventIds: readonly string[]
    ) => Effect.Effect<ReadonlyMap<string, Card>, InfrastructureError>;
    readonly expire: (
      cutoffMs: number
    ) => Effect.Effect<number, InfrastructureError>;
  }
>()("emitkit/cards/Cards") {
  static readonly layer = Layer.effect(
    Cards,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const read = Effect.fnUntraced(function* (rows: readonly unknown[]) {
        const decoded = yield* decodeRows(rows).pipe(
          Effect.mapError(infrastructure("cards.decode"))
        );
        const nowMs = yield* Clock.currentTimeMillis;
        return decoded.map((row) => toCard(row, nowMs));
      });

      const create = Effect.fn("Cards.create")(function* (card: NewCard) {
        yield* sql`insert into event_card ${sql.insert({
          actions: encodeActions(card.actions),
          callback_url: card.callbackUrl,
          channel_id: card.channelId,
          channel_name: card.channelName,
          created_at_ms: card.createdAtMs,
          description: card.description,
          event_id: card.eventId,
          expires_at_ms: card.expiresAtMs,
          fields: encodeFields(card.fields),
          icon: card.icon,
          organization_id: card.organizationId,
          project_id: card.projectId,
          resume: card.resume,
          status: card.expiresAtMs === null ? null : "pending",
          title: card.title,
        })}`.pipe(Effect.mapError(infrastructure("cards.create")));
      });

      const remove = Effect.fn("Cards.remove")(function* (
        organizationId: string,
        eventId: string
      ) {
        yield* sql`delete from event_card where event_id = ${eventId} and organization_id = ${organizationId}`.pipe(
          Effect.mapError(infrastructure("cards.remove"))
        );
      });

      const get = Effect.fn("Cards.get")(function* (
        organizationId: string,
        eventId: string
      ) {
        const rows = yield* sql`
          select * from event_card where event_id = ${eventId} and organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("cards.get")));
        const [card] = yield* read(rows);
        return Option.fromNullishOr(card);
      });

      const findForMember = Effect.fn("Cards.findForMember")(function* (
        userId: string,
        eventId: string
      ) {
        const rows = yield* sql`
          select c.* from event_card c
          join member m on m."organizationId" = c.organization_id and m."userId" = ${userId}
          join project p on p.id = c.project_id and p.deleted_at is null
          join channel ch on ch.id = c.channel_id and ch.deleted_at is null
          where c.event_id = ${eventId}
        `.pipe(Effect.mapError(infrastructure("cards.findForMember")));
        const [card] = yield* read(rows);
        if (!card) {
          return yield* new NotFoundError({ entity: "Event", id: eventId });
        }
        return card;
      });

      const answer = Effect.fn("Cards.answer")(function* (
        answerer: Answerer,
        eventId: string,
        reply: { readonly action: string; readonly values: AnswerValues }
      ) {
        const card = yield* findForMember(answerer.userId, eventId);
        if (!card.answer) {
          return yield* new InvalidInputError({
            message: "This event has nothing to answer",
          });
        }
        if (card.answer.status !== "pending") {
          return yield* new ConflictError({
            message: settledMessage(card.answer),
          });
        }
        const checked = checkAnswer(card, reply.action, reply.values);
        if (!checked.ok) {
          return yield* new InvalidInputError({
            message: Object.values(checked.problems).join(". "),
          });
        }
        const nowMs = yield* Clock.currentTimeMillis;
        // First answer wins: only a row still pending and unexpired changes.
        const rows = yield* sql`
          update event_card set
            status = 'answered',
            action = ${reply.action},
            answer_values = ${encodeValues(checked.values)},
            answered_by = ${answerer.userId},
            answered_by_name = ${answerer.name},
            answered_by_email = ${answerer.email},
            answered_at_ms = ${nowMs}
          where event_id = ${eventId} and status = 'pending' and expires_at_ms > ${nowMs}
          returning *
        `.pipe(Effect.mapError(infrastructure("cards.answer")));
        const [answered] = yield* read(rows);
        if (answered) {
          return answered;
        }
        const current = yield* findForMember(answerer.userId, eventId);
        return yield* new ConflictError({
          message: current.answer
            ? settledMessage(current.answer)
            : "This event has nothing to answer",
        });
      });

      const cancel = Effect.fn("Cards.cancel")(function* (
        organizationId: string,
        projectId: string,
        eventId: string
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        const rows = yield* sql`
          update event_card set status = 'canceled'
          where event_id = ${eventId} and organization_id = ${organizationId} and project_id = ${projectId}
            and status = 'pending' and expires_at_ms > ${nowMs}
          returning *
        `.pipe(Effect.mapError(infrastructure("cards.cancel")));
        const [canceled] = yield* read(rows);
        if (canceled) {
          return canceled;
        }
        const current = Option.getOrUndefined(
          yield* get(organizationId, eventId)
        );
        if (!(current?.answer && current.projectId === projectId)) {
          return yield* new NotFoundError({ entity: "Question", id: eventId });
        }
        // Canceling twice is the same as once, so a retried call succeeds.
        if (current.answer.status === "canceled") {
          return current;
        }
        return yield* new ConflictError({
          message: `Only a pending event can be canceled. ${settledMessage(current.answer)}`,
        });
      });

      const expireIfDue = Effect.fn("Cards.expireIfDue")(function* (
        organizationId: string,
        eventId: string
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        const rows = yield* sql`
          update event_card set status = 'expired'
          where event_id = ${eventId} and organization_id = ${organizationId}
            and status in ('pending', 'expired') and expires_at_ms <= ${nowMs}
          returning *
        `.pipe(Effect.mapError(infrastructure("cards.expireIfDue")));
        const [expired] = yield* read(rows);
        return Option.fromNullishOr(expired);
      });

      const recordDelivery = Effect.fn("Cards.recordDelivery")(function* (
        eventId: string,
        attempt: number,
        delivery: { readonly status: number | null; readonly ok: boolean }
      ) {
        const nowMs = yield* Clock.currentTimeMillis;
        // By number, so an attempt the queue runs twice counts once; and a
        // delivery, once made, stays recorded.
        yield* sql`
          update event_card set
            callback_attempts = max(callback_attempts, ${attempt}),
            callback_last_status = ${delivery.status},
            callback_delivered_at_ms = coalesce(callback_delivered_at_ms, ${delivery.ok ? nowMs : null})
          where event_id = ${eventId}
        `.pipe(Effect.mapError(infrastructure("cards.recordDelivery")));
      });

      const forEvents = Effect.fn("Cards.forEvents")(function* (
        organizationId: string,
        eventIds: readonly string[]
      ) {
        if (eventIds.length === 0) {
          return new Map<string, Card>();
        }
        const rows = yield* sql`
          select * from event_card
          where organization_id = ${organizationId} and ${sql.in("event_id", eventIds)}
        `.pipe(Effect.mapError(infrastructure("cards.forEvents")));
        const found = yield* read(rows);
        return new Map(found.map((card) => [card.eventId, card]));
      });

      const expire = Effect.fn("Cards.expire")(function* (cutoffMs: number) {
        const rows = yield* sql<{ readonly id: string }>`
          delete from event_card where created_at_ms < ${cutoffMs} returning event_id as id
        `.pipe(Effect.mapError(infrastructure("cards.expire")));
        return rows.length;
      });

      return Cards.of({
        answer,
        cancel,
        create,
        expire,
        expireIfDue,
        findForMember,
        forEvents,
        get,
        recordDelivery,
        remove,
      });
    })
  );
}
