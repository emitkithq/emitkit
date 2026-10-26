import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import type { ReactNode } from "react";
import { useId } from "react";

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * A labelled native `<select>`, styled as a HeroUI field. Native selects are
 * the right tool for short option lists on every device, phones included.
 */
export const SelectField = ({
  className,
  compact = false,
  description,
  hideLabel = false,
  isDisabled,
  label,
  onValueChange,
  options,
  placeholder,
  required,
  value,
}: {
  className?: string;
  compact?: boolean;
  description?: ReactNode;
  hideLabel?: boolean;
  isDisabled?: boolean | undefined;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string | undefined;
  required?: boolean;
  value: string;
}) => {
  const id = useId();
  return (
    <div
      className={cn(
        "inline-flex flex-col gap-1",
        compact ? "" : "w-full",
        className
      )}
    >
      <label
        className={
          hideLabel
            ? "sr-only"
            : "text-muted text-meta block w-fit pb-0.5 font-medium"
        }
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative flex w-full items-center">
        <select
          className={cn(
            "rounded-field border-field-border bg-field text-field-foreground min-h-9 w-full cursor-(--cursor-interactive) appearance-none border-(length:--border-width-field) py-2 pr-8 pl-3 text-sm transition-colors outline-none",
            "hover:border-field-border-hover hover:bg-field-hover focus:border-field-border-focus focus:bg-field-focus focus-visible:ring-focus focus-visible:ring-2",
            "disabled:pointer-events-none disabled:cursor-(--cursor-disabled) disabled:opacity-(--disabled-opacity)",
            compact && "text-body min-h-8 py-1",
            // The empty option (a placeholder, or "All …") reads muted.
            value === "" && "text-field-placeholder"
          )}
          disabled={isDisabled}
          id={id}
          onChange={(event) => onValueChange(event.target.value)}
          required={required}
          value={value}
        >
          {placeholder === undefined ? null : (
            <option value="">{placeholder}</option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          className="text-field-placeholder pointer-events-none absolute right-2"
          name="chevron-down"
          size={16}
        />
      </div>
      {description ? (
        <p className="text-muted text-meta mt-1">{description}</p>
      ) : null}
    </div>
  );
};
