import { expiresText } from "@app/features/answers/answer-text";
import { FieldControl } from "@app/features/answers/field-control";
import { errorMessage, rpcErrorCode } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Spinner, toast } from "@heroui/react";
import {
  answerButtons,
  buttonsOf,
  checkAnswer,
  initialValues,
} from "@shared/actions";
import type {
  AnswerValue,
  AnswerValues,
  Button as ActionButton,
  Field,
} from "@shared/actions";
import type { AnswerCard } from "@shared/rpc/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import { useRef, useState } from "react";

type Problems = Readonly<Record<string, string>>;

const buttonVariant = (button: ActionButton) => {
  if (button.style === "primary") {
    return "primary";
  }
  return button.style === "destructive" ? "danger-soft" : "secondary";
};

/**
 * A lone single choice without buttons is answered with one tap on an
 * option (the implied Send would only add a second tap).
 */
const oneTapField = (card: AnswerCard) => {
  const [field] = card.fields;
  return card.fields.length === 1 &&
    field?.type === "choice" &&
    field.multiple !== true &&
    buttonsOf(card.actions).length === 0
    ? field
    : undefined;
};

const useSubmitAnswer = (eventId: string) => {
  const queryClient = useQueryClient();
  const queryKey = orpc.answers.get.queryKey({ input: { eventId } });
  return useMutation({
    mutationFn: (answer: { action: string; values: AnswerValues }) =>
      rpc.answers.submit({ ...answer, eventId }),
    onError: async (error) => {
      const message = errorMessage(error, "Your answer couldn't be sent.");
      if (rpcErrorCode(error) === "CONFLICT") {
        // Someone else answered, or it expired or was canceled: show that.
        toast.warning(message);
        await queryClient.invalidateQueries({ queryKey });
        return;
      }
      toast.danger(message);
    },
    onSuccess: (card) => queryClient.setQueryData(queryKey, card),
  });
};

const Expires = ({ expiresAt }: { expiresAt: string }) => (
  <p className="text-muted text-body pt-1 text-center">
    {expiresText(expiresAt)}
  </p>
);

const Problem = ({ message }: { message: string | undefined }) =>
  message ? (
    <p className="text-danger text-body text-center" role="alert">
      {message}
    </p>
  ) : null;

/** The options as big rows: tapping one sends it. */
const OneTapChoice = ({
  expiresAt,
  field,
  onPick,
  pending,
  problem,
}: {
  expiresAt: string;
  field: Extract<Field, { type: "choice" }>;
  onPick: (optionId: string) => void;
  pending: AnswerValue | undefined;
  problem: string | undefined;
}) => (
  <div className="grid gap-2 pt-6 pb-10">
    <fieldset>
      <legend className="text-label text-foreground block pb-2 font-medium">
        {field.label}
      </legend>
      <div className="border-border overflow-hidden rounded-xl border">
        {field.options.map((option) => (
          <button
            className={cn(
              "text-label text-foreground border-border hover:bg-default-soft focus-visible:ring-focus flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none not-first:border-t focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-default",
              pending !== undefined && pending !== option.id && "opacity-60"
            )}
            disabled={pending !== undefined}
            key={option.id}
            onClick={() => onPick(option.id)}
            type="button"
          >
            <span className="flex-1">{option.label}</span>
            {pending === option.id ? (
              <Spinner aria-label="Sending" size="sm" />
            ) : (
              <Icon className="text-muted" name="chevron-right" size={16} />
            )}
          </button>
        ))}
      </div>
    </fieldset>
    <Problem message={problem} />
    <Expires expiresAt={expiresAt} />
  </div>
);

/** The fields and buttons of an event that is still waiting for an answer. */
export const AnswerForm = ({
  card,
  expiresAt,
}: {
  card: AnswerCard;
  expiresAt: string;
}) => {
  const [values, setValues] = useState<AnswerValues>(() =>
    initialValues(card.fields)
  );
  const [problems, setProblems] = useState<Problems>({});
  const fieldsRef = useRef<HTMLDivElement>(null);
  const submit = useSubmitAnswer(card.eventId);
  // What is being sent right now, to mark the pressed button or option.
  const sending = submit.isPending ? submit.variables : undefined;

  const send = (action: string, answer: AnswerValues) => {
    const checked = checkAnswer(card, action, answer);
    if (!checked.ok) {
      setProblems(checked.problems);
      // The field that needs attention may sit behind the pinned buttons.
      const first = card.fields.find((field) => checked.problems[field.id]);
      const node = first
        ? fieldsRef.current?.querySelector<HTMLElement>(
            `[data-field="${CSS.escape(first.id)}"]`
          )
        : null;
      // Its bottom (where the message appears) lands above the pinned buttons.
      node?.scrollIntoView({ behavior: "smooth", block: "end" });
      node
        ?.querySelector<HTMLElement>("input, textarea, button")
        ?.focus({ preventScroll: true });
      return;
    }
    setProblems({});
    submit.mutate({ action, values: checked.values });
  };

  const change = (id: string, value: AnswerValue) => {
    setValues((current) => ({ ...current, [id]: value }));
    setProblems((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => key !== id && key !== "action"
        )
      )
    );
  };

  const single = oneTapField(card);
  if (single) {
    return (
      <OneTapChoice
        expiresAt={expiresAt}
        field={single}
        onPick={(optionId) => send("submit", { [single.id]: optionId })}
        pending={sending?.values[single.id]}
        problem={problems.action ?? problems[single.id]}
      />
    );
  }

  return (
    <>
      <div className="grid flex-1 content-start gap-5 pt-6" ref={fieldsRef}>
        {card.fields.map((field) => (
          <div className="scroll-mb-56" data-field={field.id} key={field.id}>
            <FieldControl
              error={problems[field.id]}
              field={field}
              onChange={(value) => change(field.id, value)}
              value={values[field.id]}
            />
          </div>
        ))}
      </div>
      <div className="border-border bg-background sticky bottom-0 -mx-4 mt-6 grid gap-2 border-t px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {answerButtons(card).map((button) => (
          <Button
            className="w-full"
            isDisabled={sending !== undefined && sending.action !== button.id}
            isPending={sending?.action === button.id}
            key={button.id}
            onPress={() => send(button.id, values)}
            size="lg"
            variant={buttonVariant(button)}
          >
            {button.label}
          </Button>
        ))}
        <Problem message={problems.action} />
        <Expires expiresAt={expiresAt} />
      </div>
    </>
  );
};
