import type { Env } from "@server/platform/env";
import type { QueueMessage } from "@shared/queue";
import { handleQueue, handleScheduled } from "@worker/background";
import { route } from "@worker/router";

export default {
  fetch: route,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env, QueueMessage>;
