import { answerJson, Cards } from "@server/cards/cards";
import type { Card } from "@server/cards/cards";
import type { InfrastructureError } from "@server/errors";
import { CallbackSender } from "@server/platform/callbacks";
import { AppConfig } from "@server/platform/config";
import { stringifyJson } from "@server/platform/json";
import { EventsQueue, MAX_DELAY_SECONDS } from "@server/platform/queue";
import type { AnswerCallbackMessage, AnswerExpireMessage } from "@shared/queue";
import { Clock, Context, Effect, Layer, Option } from "effect";

/**
 * Seconds to wait before attempt n + 1 after attempt n failed: about 16
 * hours of retries over 10 attempts, then the answer stays readable with
 * GET only.
 */
const BACKOFF_SECONDS = [10, 30, 120, 600, 1800, 3600, 7200, 14_400, 28_800];

/** The body EmitKit POSTs to a `callbackUrl`. */
const payload = (
  card: Card,
  kind: AnswerCallbackMessage["kind"],
  appUrl: string
) =>
  stringifyJson({
    answer: card.answer ? answerJson(card.eventId, card.answer, appUrl) : null,
    eventId: card.eventId,
    resume: card.resume,
    type: `event.${kind}`,
  });

/**
 * The callbacks of events that wait: `event.expired` when a question runs
 * out of time, and delivering `event.answered` / `event.expired` to the
 * sender's `callbackUrl` with retries. Queue consumers call these.
 */
export class Callbacks extends Context.Service<
  Callbacks,
  {
    /**
     * An expiry check came due: expire the card and queue `event.expired`.
     * Also the backstop for a callback that was never queued: an answered or
     * expired card with no attempt yet gets its callback now.
     */
    readonly expire: (
      message: AnswerExpireMessage
    ) => Effect.Effect<void, InfrastructureError>;
    /** Sends one attempt; a failure queues the next one. */
    readonly deliver: (
      message: AnswerCallbackMessage
    ) => Effect.Effect<void, InfrastructureError>;
  }
>()("emitkit/cards/Callbacks") {
  static readonly layer = Layer.effect(
    Callbacks,
    Effect.gen(function* () {
      const cards = yield* Cards;
      const queue = yield* EventsQueue;
      const sender = yield* CallbackSender;
      const { appUrl } = yield* AppConfig;

      const queueCallback = (
        message: AnswerExpireMessage,
        kind: AnswerCallbackMessage["kind"]
      ) =>
        queue.send({
          attempt: 1,
          eventId: message.eventId,
          kind,
          organizationId: message.organizationId,
          type: "answer.callback",
        });

      const expire = Effect.fn("Callbacks.expire")(function* (
        message: AnswerExpireMessage
      ) {
        const card = Option.getOrUndefined(
          yield* cards.get(message.organizationId, message.eventId)
        );
        const answer = card?.answer;
        if (!(answer && card?.callback) || answer.status === "canceled") {
          return;
        }
        // Answered, but no attempt yet: queuing its callback failed then.
        if (answer.status === "answered") {
          if (card.callback.attempts === 0) {
            yield* queueCallback(message, "answered");
          }
          return;
        }
        const nowMs = yield* Clock.currentTimeMillis;
        // Expiry more than a day out: check again when the next delay allows.
        if (answer.expiresAtMs > nowMs) {
          yield* queue.send(message, {
            delaySeconds: Math.min(
              MAX_DELAY_SECONDS,
              Math.ceil((answer.expiresAtMs - nowMs) / 1000)
            ),
          });
          return;
        }
        const expired = yield* cards.expireIfDue(
          message.organizationId,
          message.eventId
        );
        // No attempt yet: the first run, or a rerun after the queue failed.
        if (Option.isSome(expired) && expired.value.callback?.attempts === 0) {
          yield* queueCallback(message, "expired");
        }
      });

      const deliver = Effect.fn("Callbacks.deliver")(function* (
        message: AnswerCallbackMessage
      ) {
        const found = yield* cards.get(message.organizationId, message.eventId);
        const card = Option.getOrUndefined(found);
        // Delivered already: a repeat of a message that went through.
        if (!card?.callback || card.callback.deliveredAtMs !== null) {
          return;
        }
        const delivery = yield* sender.send({
          body: payload(card, message.kind, appUrl),
          id: `msg_${card.eventId}_${message.kind}`,
          projectId: card.projectId,
          url: card.callback.url,
        });
        yield* cards.recordDelivery(card.eventId, message.attempt, delivery);
        const wait = BACKOFF_SECONDS[message.attempt - 1];
        if (!delivery.ok && wait !== undefined) {
          yield* queue.send(
            { ...message, attempt: message.attempt + 1 },
            { delaySeconds: wait }
          );
        }
        yield* Effect.logInfo("callback", {
          attempt: message.attempt,
          eventId: card.eventId,
          kind: message.kind,
          status: delivery.status,
        });
      });

      return Callbacks.of({ deliver, expire });
    })
  );
}
