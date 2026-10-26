import { AnswerForm } from "@app/features/answers/answer-form";
import { AnswerOutcome } from "@app/features/answers/answer-outcome";
import { timeText } from "@app/features/answers/answer-text";
import { LinkChips } from "@app/features/answers/link-chips";
import { errorMessage, rpcErrorCode } from "@app/lib/errors";
import { usePageTitle } from "@app/lib/page-title";
import { orpc } from "@app/lib/rpc";
import { Button, Spinner } from "@heroui/react";
import { isLink } from "@shared/actions";
import type { AnswerCard } from "@shared/rpc/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";

/** A missing event and one in someone else's organization look the same. */
const isUnavailable = (error: unknown) => {
  const code = rpcErrorCode(error);
  // BAD_REQUEST: an id that can't be an event id.
  return code === "NOT_FOUND" || code === "BAD_REQUEST";
};

const EventHeader = ({ card }: { card: AnswerCard }) => (
  <header>
    <div className="text-muted text-body flex items-center gap-2">
      <span
        aria-hidden="true"
        className="bg-default-soft grid size-8 shrink-0 place-items-center rounded-lg text-[16px]"
      >
        {card.icon ?? <Icon name="activity" size={14} />}
      </span>
      <span className="truncate">#{card.channelName}</span>
      <span aria-hidden="true">·</span>
      <time className="shrink-0" dateTime={card.createdAt}>
        {timeText(card.createdAt)}
      </time>
    </div>
    <h1 className="mt-4 text-2xl leading-tight font-semibold tracking-[-0.02em] break-words">
      {card.title}
    </h1>
    {card.description ? (
      <p className="text-muted text-label mt-2 break-words whitespace-pre-wrap">
        {card.description}
      </p>
    ) : null}
    <LinkChips
      className="mt-4 flex flex-wrap gap-2"
      links={card.actions.filter(isLink)}
    />
  </header>
);

/**
 * The answer page (`/a/$id`, what a push for an event that waits opens):
 * the event, then its fields and buttons while it waits, or what happened.
 */
export const AnswerPage = ({ eventId }: { eventId: string }) => {
  const card = useQuery(orpc.answers.get.queryOptions({ input: { eventId } }));
  usePageTitle(card.data?.title ?? "Answer");

  if (card.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner aria-label="Loading event" size="sm" />
      </div>
    );
  }
  if (card.isError) {
    return isUnavailable(card.error) ? (
      <EmptyState
        action={
          <Link
            className="text-accent-soft-foreground text-body no-underline hover:underline"
            to="/"
          >
            Go to your dashboard
          </Link>
        }
        description="It doesn't exist, or it belongs to an organization you're not a member of."
        icon="search"
        title="Event unavailable"
        variant="dashed"
      />
    ) : (
      <EmptyState
        action={
          <Button onPress={() => card.refetch()} size="sm" variant="secondary">
            Try again
          </Button>
        }
        description={errorMessage(
          card.error,
          "EmitKit couldn't load this event. Check your connection and try again."
        )}
        icon="close"
        title="Something went wrong"
        variant="dashed"
      />
    );
  }

  const { answer } = card.data;
  if (answer?.status === "pending") {
    return (
      <article className="flex flex-1 flex-col">
        <EventHeader card={card.data} />
        <AnswerForm card={card.data} expiresAt={answer.expiresAt} />
      </article>
    );
  }
  return (
    <article className="pb-10">
      <EventHeader card={card.data} />
      {answer ? (
        <div className="mt-6">
          <AnswerOutcome answer={answer} card={card.data} />
        </div>
      ) : null}
    </article>
  );
};
