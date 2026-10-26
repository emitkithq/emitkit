import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

export const controlClassName =
  "w-full rounded-lg border border-field-border bg-field px-3 py-2 text-label text-foreground outline-none placeholder:text-field-placeholder hover:border-field-border-hover focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60";

interface FieldShellProps {
  description?: ReactNode;
  error?: string | undefined;
  label: string;
}

const FieldShell = ({
  children,
  description,
  error,
  id,
  label,
}: FieldShellProps & { children: ReactNode; id: string }) => (
  <div className="block">
    <label className="text-muted text-meta block pb-1 font-medium" htmlFor={id}>
      {label}
    </label>
    {children}
    {description && !error ? (
      <p className="text-muted text-meta mt-1">{description}</p>
    ) : null}
    {error ? (
      <p className="text-orb-coral text-meta mt-1" id={`${id}-error`}>
        {error}
      </p>
    ) : null}
  </div>
);

/** A labelled text input in the v2 field style. */
export const TextInput = ({
  description,
  error,
  label,
  onValueChange,
  ...props
}: FieldShellProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange"> & {
    onValueChange?: (value: string) => void;
  }) => {
  const id = useId();
  return (
    <FieldShell description={description} error={error} id={id} label={label}>
      <input
        {...props}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className={controlClassName}
        id={id}
        onChange={
          onValueChange
            ? (event) => onValueChange(event.target.value)
            : undefined
        }
      />
    </FieldShell>
  );
};

export const TextAreaInput = ({
  description,
  error,
  label,
  onValueChange,
  ...props
}: FieldShellProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "onChange"> & {
    onValueChange: (value: string) => void;
  }) => {
  const id = useId();
  return (
    <FieldShell description={description} error={error} id={id} label={label}>
      <textarea
        {...props}
        aria-invalid={error ? true : undefined}
        className={`${controlClassName} min-h-20 resize-y`}
        id={id}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </FieldShell>
  );
};
