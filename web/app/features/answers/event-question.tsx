import { LinkChips } from "@app/features/answers/link-chips";
import type { EventActions } from "@app/features/events/event-details";
import { Link } from "@tanstack/react-router";
import { Icon } from "@ui/icon";

const STATE_TEXT = {
  canceled: "Canceled: no longer needed",
  expired: "Expired: nobody answered",
  pending: "Waiting for an answer",
} as const;

/**
 * In the feed's event details: where a question stands, with a way to its
 * answer page, and the event's links.
 */
export const EventQuestion: EventActions = ({ event }) => {
  const { links, question } = event;
  if (!question && links.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {question ? (
        <div className="bg-default-soft text-body flex items-center gap-3 rounded-xl px-3.5 py-2.5">
          <Icon
            className={
              question.status === "answered" ? "text-success" : "text-muted"
            }
            name={question.status === "answered" ? "check" : "clock"}
            size={14}
          />
          <span className="text-foreground flex-1">
            {question.status === "answered"
              ? `Answered by ${question.answeredBy || "someone"}`
              : STATE_TEXT[question.status]}
          </span>
          <Link
            className={
              question.status === "pending"
                ? "bg-accent text-accent-foreground rounded-full px-3 py-1 font-medium no-underline"
                : "text-accent-soft-foreground no-underline hover:underline"
            }
            params={{ id: event.id }}
            to="/a/$id"
          >
            {question.status === "pending" ? "Answer" : "Open"}
          </Link>
        </div>
      ) : null}
      <LinkChips links={links} />
    </div>
  );
};
