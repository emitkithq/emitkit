import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { CloudflareEnv } from "@server/platform/cloudflare";
import type { QueueMessage } from "@shared/queue";
import { Context, Effect, Layer } from "effect";

/** Cloudflare Queues delay a message by at most 24 hours. */
export const MAX_DELAY_SECONDS = 86_400;

/** Producer side of the `emitkit-events` queue (consumed by the same Worker). */
export class EventsQueue extends Context.Service<
  EventsQueue,
  {
    readonly send: (
      message: QueueMessage,
      options?: { readonly delaySeconds?: number }
    ) => Effect.Effect<void, InfrastructureError>;
  }
>()("emitkit/platform/EventsQueue") {
  static readonly layer = Layer.effect(
    EventsQueue,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const send = Effect.fn("EventsQueue.send")(function* (
        message: QueueMessage,
        options?: { readonly delaySeconds?: number }
      ) {
        yield* Effect.tryPromise({
          catch: infrastructure("queue.send"),
          try: () => env.EVENTS_QUEUE.send(message, options),
        });
      });
      return EventsQueue.of({ send });
    })
  );
}
