import { twMerge } from "@ui/tailwind";

type ClassValue = string | number | false | null | undefined;

/**
 * Join conditional class names and resolve Tailwind conflicts, so a
 * caller-supplied `className` cleanly overrides a component's defaults.
 */
export const cn = (...inputs: ClassValue[]): string =>
  twMerge(inputs.filter(Boolean).join(" "));
