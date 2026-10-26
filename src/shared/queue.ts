/** Messages on the `emitkit-events` queue. */
export interface EventCreatedMessage {
  readonly type: "event.created";
  readonly organizationId: string;
  readonly projectId: string;
  readonly channelId: string;
  readonly eventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly icon: string | null;
  /** The event waits for an answer: the push opens its answer page. Absent on messages sent before answers existed. */
  readonly waits?: boolean;
}

/** An event with a callback reached (or neared) its expiry. */
export interface AnswerExpireMessage {
  readonly type: "answer.expire";
  readonly organizationId: string;
  readonly eventId: string;
}

/** Tell the sender's `callbackUrl` what happened; `attempt` starts at 1. */
export interface AnswerCallbackMessage {
  readonly type: "answer.callback";
  readonly organizationId: string;
  readonly eventId: string;
  readonly kind: "answered" | "expired";
  readonly attempt: number;
}

export type QueueMessage =
  | EventCreatedMessage
  | AnswerExpireMessage
  | AnswerCallbackMessage;
