import { timeText, valueText } from "@app/features/answers/answer-text";
import { buttonsOf } from "@shared/actions";
import type { AnswerCard } from "@shared/rpc/schemas";
import { Icon } from "@ui/icon";
import type { IconName } from "@ui/icon";
import type { ReactNode } from "react";

type Answer = NonNullable<AnswerCard["answer"]>;

const Settled = ({
  children,
  icon,
}: {
  children: ReactNode;
  icon: IconName;
}) => (
  <div className="bg-default-soft text-muted text-label flex items-center gap-2 rounded-xl px-4 py-3">
    <Icon className="shrink-0" name={icon} size={14} />
    <p>{children}</p>
  </div>
);

/** What was decided, in place of the fields and buttons. */
export const AnswerOutcome = ({
  answer,
  card,
}: {
  answer: Answer;
  card: AnswerCard;
}) => {
  if (answer.status === "expired") {
    return (
      <Settled icon="clock">
        Expired at {timeText(answer.expiresAt)}. Nobody answered.
      </Settled>
    );
  }
  if (answer.status === "canceled") {
    return (
      <Settled icon="close">
        No longer needed. The sender canceled this question.
      </Settled>
    );
  }
  const by = answer.by || "Someone";
  // The implied Send button isn't in `actions`: pressing it is "answered".
  const button = buttonsOf(card.actions).find(
    (candidate) => candidate.id === answer.action
  );
  const values = answer.values ?? {};
  return (
    <section aria-label="Answer" className="bg-success/10 rounded-xl px-4 py-3">
      <div className="text-label text-foreground flex items-start gap-2 font-medium">
        <Icon className="text-success mt-1 shrink-0" name="check" size={14} />
        <p className="flex-1">
          {button ? `${by} chose “${button.label}”` : `${by} answered`}
        </p>
        {answer.at ? (
          <time
            className="text-muted shrink-0 font-normal"
            dateTime={answer.at}
          >
            {timeText(answer.at)}
          </time>
        ) : null}
      </div>
      {card.fields.length > 0 ? (
        <dl className="text-body mt-2 grid gap-1">
          {card.fields.map((field) => (
            <div className="flex gap-3" key={field.id}>
              <dt className="text-muted w-28 shrink-0">{field.label}</dt>
              <dd className="text-foreground min-w-0 break-words whitespace-pre-wrap">
                {valueText(field, values[field.id])}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
};
