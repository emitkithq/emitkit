import { Callbacks } from "@server/cards/callbacks";
import type { InfrastructureError } from "@server/errors";
import { Notifications } from "@server/notifications/notifications";
import { AppConfig } from "@server/platform/config";
import type { Env } from "@server/platform/env";
import { Retention } from "@server/retention/retention";
import type { EventCreatedMessage, QueueMessage } from "@shared/queue";
import { appRuntime } from "@worker/runtime";
import { Effect } from "effect";

const pushEvent = (event: EventCreatedMessage) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const notifications = yield* Notifications;
    const delivered = yield* notifications.deliver(event, config.appUrl);
    yield* Effect.logInfo("push fan-out", {
      delivered,
      eventId: event.eventId,
    });
  });

/** The work for one message; types this Worker doesn't know are dropped. */
const work = (
  body: QueueMessage
): Effect.Effect<
  void,
  InfrastructureError,
  AppConfig | Notifications | Callbacks
> => {
  switch (body.type) {
    case "event.created": {
      return pushEvent(body);
    }
    case "answer.expire": {
      return Callbacks.use((callbacks) => callbacks.expire(body));
    }
    case "answer.callback": {
      return Callbacks.use((callbacks) => callbacks.deliver(body));
    }
    default: {
      return Effect.logWarning("unknown queue message dropped", body);
    }
  }
};

const handle = (message: Message<QueueMessage>) =>
  work(message.body).pipe(
    Effect.andThen(Effect.sync(() => message.ack())),
    Effect.catchCause((cause) =>
      Effect.logError("queue message failed; retrying", cause).pipe(
        Effect.andThen(
          Effect.sync(() =>
            message.retry({
              delaySeconds: Math.min(60, 5 * 2 ** message.attempts),
            })
          )
        )
      )
    )
  );

/**
 * Queue consumer, 5 messages at a time: pushes created events to Web Push
 * subscribers, and runs the expiry and callbacks of events that wait for
 * an answer (callbacks retry with their own backoff, as new messages).
 */
export const handleQueue = async (
  batch: MessageBatch<QueueMessage>,
  env: Env
) => {
  const runtime = await appRuntime(env);
  await runtime.runPromise(
    Effect.forEach(batch.messages, handle, { concurrency: 5, discard: true })
  );
};

/** Cron trigger: retention sweep. */
export const handleScheduled = async (
  _controller: ScheduledController,
  env: Env
) => {
  const runtime = await appRuntime(env);
  await runtime.runPromise(
    Retention.use((retention) => Effect.asVoid(retention.sweep))
  );
};
