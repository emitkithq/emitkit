import { cn } from "@ui/cn";

export type OrbHue = "amber" | "coral" | "green" | "teal" | "violet";

const sizeClasses = {
  lg: "size-10 text-sm",
  md: "size-7 text-[12px]",
  sm: "size-5.5 text-[10px]",
  xs: "size-4 text-[8px]",
} as const;

const hues: readonly OrbHue[] = ["violet", "teal", "amber", "green", "coral"];

/** A stable orb hue for any string (a user id, an email, a project name). */
export const hueFor = (seed: string): OrbHue => {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
  }
  return hues[hash % hues.length] ?? "violet";
};

const WHITESPACE = /\s+/u;

/** First and last initial of a name, falling back to the email's first letter. */
export const initialsFor = (name: string, email = ""): string => {
  const words = name.trim().split(WHITESPACE).filter(Boolean);
  const first = words[0]?.[0] ?? email[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
};

/**
 * A person's or an organization's avatar: their initials on one of the
 * signature orb hues, or their image when they have one.
 */
export const MemberAvatar = ({
  className,
  hue,
  image,
  initials,
  size = "md",
}: {
  className?: string;
  hue: OrbHue;
  image?: string | undefined;
  initials: string;
  size?: keyof typeof sizeClasses;
}) =>
  image ? (
    <img
      alt=""
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full object-cover",
        sizeClasses[size],
        className
      )}
      src={image}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "text-snow inline-grid shrink-0 place-items-center rounded-full leading-none font-semibold",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: `var(--orb-${hue})` }}
    >
      {initials}
    </span>
  );
