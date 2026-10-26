import { controlClassName } from "@app/components/fields";
import {
  pickedIds,
  unitAfter,
  unitBefore,
} from "@app/features/answers/answer-text";
import { Button, Switch } from "@heroui/react";
import type { AnswerValue, Field } from "@shared/actions";
import { cn } from "@ui/cn";
import { useId } from "react";

type FieldOf<T extends Field["type"]> = Extract<Field, { type: T }>;

interface ControlProps<F extends Field> {
  error: string | undefined;
  errorId: string;
  field: F;
  onChange: (value: AnswerValue) => void;
  value: AnswerValue | undefined;
}

const labelClassName = "text-label text-foreground block pb-2 font-medium";
// 16px on phones, so focusing the input doesn't zoom the page on iOS.
const textClassName = cn(controlClassName, "sm:text-label text-base");

const FieldError = ({
  error,
  id,
}: {
  error: string | undefined;
  id: string;
}) =>
  error ? (
    <p className="text-danger text-body mt-1.5" id={id}>
      {error}
    </p>
  ) : null;

/** Radio rows for a single choice, checkbox rows for a multiple one. */
const ChoiceControl = ({
  error,
  errorId,
  field,
  onChange,
  value,
}: ControlProps<FieldOf<"choice">>) => {
  const picked = pickedIds(value);
  const toggle = (id: string) => {
    if (!field.multiple) {
      onChange(id);
      return;
    }
    onChange(
      picked.includes(id)
        ? picked.filter((pickedId) => pickedId !== id)
        : [...picked, id]
    );
  };
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={labelClassName}>{field.label}</legend>
      <div className="border-border overflow-hidden rounded-xl border">
        {field.options.map((option) => {
          const isOn = picked.includes(option.id);
          return (
            <label
              className={cn(
                "text-label border-border flex cursor-pointer items-center gap-3 px-3.5 py-3 not-first:border-t",
                isOn ? "bg-accent/5" : "hover:bg-default-soft"
              )}
              key={option.id}
            >
              <input
                checked={isOn}
                className="accent-accent size-4 shrink-0"
                name={field.id}
                onChange={() => toggle(option.id)}
                type={field.multiple ? "checkbox" : "radio"}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <FieldError error={error} id={errorId} />
    </fieldset>
  );
};

const TextControl = ({
  error,
  errorId,
  field,
  onChange,
  value,
}: ControlProps<FieldOf<"text">>) => {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  const describedBy = error ? errorId : undefined;
  return (
    <div>
      <label className={labelClassName} htmlFor={id}>
        {field.label}
      </label>
      {field.multiline ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(textClassName, "min-h-24 resize-y")}
          id={id}
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={text}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={textClassName}
          id={id}
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={text}
        />
      )}
      <FieldError error={error} id={errorId} />
    </div>
  );
};

const decimalsOf = (value: number) =>
  (String(value).split(".")[1] ?? "").length;

/** A −/+ stepper, kept within min…max. */
const NumberControl = ({
  error,
  errorId,
  field,
  onChange,
  value,
}: ControlProps<FieldOf<"number">>) => {
  const current = typeof value === "number" ? value : 0;
  const step = field.step ?? 1;
  const nudge = (direction: 1 | -1) => {
    const decimals = Math.max(decimalsOf(step), decimalsOf(current));
    const next = Number((current + direction * step).toFixed(decimals));
    onChange(Math.min(field.max ?? next, Math.max(field.min ?? next, next)));
  };
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={labelClassName}>{field.label}</legend>
      <div className="flex items-center gap-2">
        <Button
          aria-label={`Decrease ${field.label}`}
          isDisabled={field.min !== undefined && current <= field.min}
          isIconOnly
          onPress={() => nudge(-1)}
          size="lg"
          variant="secondary"
        >
          −
        </Button>
        <label className="border-field-border bg-field focus-within:border-accent flex flex-1 items-center justify-center gap-1 rounded-xl border py-2 text-xl font-semibold tabular-nums">
          {unitBefore(field.unit)}
          <input
            aria-describedby={error ? errorId : undefined}
            aria-label={field.label}
            className="w-24 [appearance:textfield] bg-transparent text-center outline-none [&::-webkit-inner-spin-button]:appearance-none"
            inputMode="decimal"
            max={field.max}
            min={field.min}
            onChange={(event) => {
              const typed = event.target.valueAsNumber;
              if (Number.isFinite(typed)) {
                onChange(typed);
              }
            }}
            step={step}
            type="number"
            value={current}
          />
          {unitAfter(field.unit)}
        </label>
        <Button
          aria-label={`Increase ${field.label}`}
          isDisabled={field.max !== undefined && current >= field.max}
          isIconOnly
          onPress={() => nudge(1)}
          size="lg"
          variant="secondary"
        >
          +
        </Button>
      </div>
      <FieldError error={error} id={errorId} />
    </fieldset>
  );
};

const BooleanControl = ({
  error,
  errorId,
  field,
  onChange,
  value,
}: ControlProps<FieldOf<"boolean">>) => (
  <div>
    <Switch
      aria-describedby={error ? errorId : undefined}
      className="w-full"
      isSelected={value === true}
      onChange={onChange}
    >
      <Switch.Content className="w-full justify-between">
        <span className="text-label text-foreground font-medium">
          {field.label}
        </span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
    <FieldError error={error} id={errorId} />
  </div>
);

/** One field of an event that waits for an answer, as an input. */
export const FieldControl = ({
  field,
  ...props
}: {
  error: string | undefined;
  field: Field;
  onChange: (value: AnswerValue) => void;
  value: AnswerValue | undefined;
}) => {
  const errorId = useId();
  switch (field.type) {
    case "choice": {
      return <ChoiceControl {...props} errorId={errorId} field={field} />;
    }
    case "text": {
      return <TextControl {...props} errorId={errorId} field={field} />;
    }
    case "number": {
      return <NumberControl {...props} errorId={errorId} field={field} />;
    }
    default: {
      return <BooleanControl {...props} errorId={errorId} field={field} />;
    }
  }
};
