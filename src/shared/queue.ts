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

/**
 * A stored event, for its MCP Events subscribers. Sent for every event, apart
 * from `event.created` (the push), so a failure in one never repeats the other.
 */
export interface McpFanOutMessage {
  readonly type: "mcp.fanout";
  readonly organizationId: string;
  readonly projectId: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly eventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly tags: readonly string[];
  /** Metadata as JSON text. */
  readonly metadata: string;
  readonly userId: string | null;
  readonly source: string;
  readonly createdAtMs: number;
  /** The API key or OAuth grant that created the event: its own subscriptions skip it. */
  readonly principalId: string | null;
}

/** One signed webhook delivery to one MCP Events subscription, retried on its own. */
export interface McpDeliveryMessage {
  readonly type: "mcp.delivery";
  readonly subscriptionId: string;
  readonly eventId: string;
  /** The exact JSON body to sign and send. */
  readonly body: string;
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
  | McpFanOutMessage
  | McpDeliveryMessage
  | AnswerExpireMessage
  | AnswerCallbackMessage;
