import type { SVGProps } from "react";

/*
 * EmitKit brand artwork, from the brand kit's SVG masters. Rules that shape
 * these components (kit README):
 * - The mark is solid Emit Blue on light surfaces and white on Emit Blue or
 *   dark ones; never black, never recoloured. So colour is a `tone`, not
 *   `currentColor`.
 * - The name is never re-set in type next to the mark: use `Wordmark`.
 * - Minimum sizes: mark 16px, wordmark 96px wide (about 26px tall). Below
 *   that, use the mark alone.
 */

const MARK_PATHS = [
  "m16.51 30.18h3.94c0.2 0 0.32 0.18 0.27 0.35l-1.68 5.37c-0.25 0.88-0.89 1.42-1.71 1.42h-7.47c0.98-0.14 1.56-1 1.82-2.15l0.37-1.55c0.48-2.01 2.34-3.44 4.46-3.44z",
  "m8.52 37.39h4.84c-0.87 0.06-1.31 0.6-1.48 1.58l-0.68 3.46c-0.17 0.83-0.56 1.19-1.2 1.19h-5.55c-0.14 0-0.23-0.09-0.22-0.23l0.19-2.13c0.19-2.22 1.97-3.87 4.1-3.87z",
  "m11.94 43.62h6.37c-0.82 0.16-1.13 1.12-1.35 2.69-0.25 2-2.07 3.39-4.02 3.39h-3.62c-0.17 0-0.26-0.12-0.22-0.28l1.23-4.39c0.22-0.93 0.81-1.41 1.61-1.41z",
  "m19.34 37.43h5.07c0.14 0 0.22 0.09 0.2 0.22l-0.32 2.56c-0.22 1.98-1.95 3.37-3.89 3.37h-5.1c1.11-0.03 1.8-0.66 2-1.68l0.73-3.17c0.18-0.89 0.64-1.3 1.31-1.3z",
] as const;

const TYPE_PATHS = [
  "m28.46 34.47h7.05c0.04 0 0.08 0.04 0.08 0.09v2.15c0 0.05-0.04 0.09-0.08 0.09h-4.36c-0.04 0-0.08 0.04-0.08 0.09v1.65c0 0.05 0.04 0.09 0.08 0.09h3.84c0.05 0 0.09 0.04 0.09 0.09v2.18c0 0.05-0.04 0.09-0.09 0.09h-3.84c-0.04 0-0.08 0.04-0.08 0.09v1.61c0 0.05 0.04 0.09 0.08 0.09h4.36c0.04 0 0.08 0.04 0.08 0.09v2.19c0 0.05-0.04 0.09-0.08 0.09h-7c-0.04 0-0.07-0.04-0.07-0.09v-10.52c-0.01-0.04 0.01-0.07 0.02-0.07z",
  "m36.37 37.04h2.32c0.05 0 0.09 0.04 0.09 0.09v0.78c0.56-0.73 1.42-1.11 2.31-1.11 1.05 0 1.82 0.49 2.16 1.19 0.59-0.79 1.54-1.19 2.43-1.19 1.79 0 2.62 1.29 2.62 2.88v5.39c0 0.05-0.04 0.09-0.09 0.09h-2.25c-0.05 0-0.09-0.04-0.09-0.09v-4.77c0-0.76-0.35-1.16-1.11-1.16-0.81 0-1.24 0.58-1.24 1.36v4.57c0 0.05-0.04 0.09-0.09 0.09h-2.23c-0.05 0-0.09-0.04-0.09-0.09v-4.77c0-0.76-0.36-1.16-1.13-1.16-0.82 0-1.17 0.64-1.17 1.44v4.49c0 0.05-0.04 0.09-0.09 0.09h-2.26c-0.05 0-0.09-0.04-0.09-0.09v-8.03z",
  "m49.26 37.09h2.29c0.06 0 0.1 0.04 0.1 0.09v7.89c0 0.05-0.04 0.09-0.1 0.09h-2.29c-0.05 0-0.08-0.04-0.08-0.09v-7.89c0-0.05 0.03-0.09 0.08-0.09z",
  "m53.26 42.55v-3.25h-1.07c-0.05 0-0.09-0.04-0.09-0.09v-2.04c0-0.05 0.04-0.09 0.09-0.09h1.07v-2.2c0-0.05 0.04-0.09 0.09-0.09h2.23c0.05 0 0.09 0.04 0.09 0.09v2.2h1.75c0.05 0 0.09 0.04 0.09 0.09v2.04c0 0.05-0.04 0.09-0.09 0.09h-1.68v2.88c0 0.57 0.35 0.79 0.89 0.79 0.3 0 0.6-0.05 0.84-0.17 0.04-0.02 0.06 0.01 0.06 0.05v2.02c0 0.06-0.03 0.12-0.09 0.15-0.47 0.18-1.04 0.28-1.59 0.28-1.62-0.04-2.59-1.02-2.59-2.75z",
  "m58.49 34.47h2.41c0.05 0 0.09 0.04 0.09 0.09v4.05c0 0.05 0.07 0.08 0.11 0.03l3.18-4.14c0.02-0.02 0.04-0.03 0.07-0.03h2.69c0.08 0 0.12 0.09 0.08 0.14l-3.65 5.03c-0.02 0.03-0.02 0.07 0 0.09l3.77 5.29c0.04 0.06 0 0.15-0.08 0.15h-2.8c-0.03 0-0.05-0.01-0.07-0.03l-2.81-3.97c-0.01-0.02-0.04-0.03-0.06-0.03h-0.34c-0.05 0-0.09 0.04-0.09 0.09v3.84c0 0.05-0.04 0.09-0.09 0.09h-2.39c-0.05 0-0.08-0.04-0.08-0.09v-10.53c0-0.04 0.03-0.07 0.06-0.07z",
  "m67.78 37.09h2.29c0.06 0 0.1 0.04 0.1 0.09v7.89c0 0.05-0.04 0.09-0.1 0.09h-2.29c-0.05 0-0.09-0.04-0.09-0.09v-7.89c0-0.05 0.04-0.09 0.09-0.09z",
  "m71.74 42.55v-3.25h-1.05c-0.05 0-0.09-0.04-0.09-0.09v-2.04c0-0.05 0.04-0.09 0.09-0.09h1.05v-2.2c0-0.05 0.04-0.09 0.09-0.09h2.29c0.05 0 0.09 0.04 0.09 0.09v2.2h1.71c0.05 0 0.09 0.04 0.09 0.09v2.04c0 0.05-0.04 0.09-0.09 0.09h-1.62v2.88c0 0.57 0.31 0.79 0.87 0.79 0.3 0 0.55-0.04 0.78-0.12 0.02-0.02 0.06 0.01 0.06 0.04v1.97c0 0.07-0.04 0.13-0.1 0.16-0.48 0.18-1.04 0.28-1.57 0.28-1.65-0.04-2.6-1.02-2.6-2.75z",
] as const;

const EMIT_BLUE = "#0A31F5";
const MIDNIGHT = "#050606";
const WHITE = "#FFFFFF";

type ArtProps = Omit<SVGProps<SVGSVGElement>, "fill" | "viewBox">;

/*
 * `tone="auto"` follows the theme through `--artwork-mark` and
 * `--artwork-wordmark` (web/ui/styles.css): blue or Midnight on light, white
 * on dark. The colours stay the kit's; only which one is chosen changes.
 */
const autoFill = (variable: string) => ({ fill: `var(${variable})` });

/** The EmitKit mark. `tone="white"` on Emit Blue or dark surfaces. */
export const BrandMark = ({
  tone = "blue",
  ...props
}: ArtProps & { tone?: "auto" | "blue" | "white" }) => (
  <svg
    aria-hidden="true"
    fill={tone === "white" ? WHITE : EMIT_BLUE}
    style={tone === "auto" ? autoFill("--artwork-mark") : undefined}
    viewBox="4.23 30.18 20.38 19.52"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {MARK_PATHS.map((d) => (
      <path d={d} key={d} />
    ))}
  </svg>
);

/**
 * The EmitKit wordmark (mark and name as one piece of artwork). Midnight on
 * light surfaces, white on Emit Blue or dark ones. Size it by height: at
 * least `h-[26px]` keeps it above the 96px minimum width. It is decorative
 * to assistive tech: label its container (`aria-label="EmitKit home"`).
 */
export const Wordmark = ({
  tone = "midnight",
  ...props
}: ArtProps & { tone?: "auto" | "midnight" | "white" }) => (
  <svg
    aria-hidden="true"
    fill={tone === "white" ? WHITE : MIDNIGHT}
    style={tone === "auto" ? autoFill("--artwork-wordmark") : undefined}
    viewBox="4.23 30.18 71.82 19.52"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {[...MARK_PATHS, ...TYPE_PATHS].map((d) => (
      <path d={d} key={d} />
    ))}
    {/* The dots of the two i's. */}
    <circle cx="50.4" cy="34.78" r="1.455" />
    <circle cx="68.92" cy="34.78" r="1.455" />
  </svg>
);

/**
 * The standard app icon: the white mark at 64% on a rounded Emit Blue tile,
 * as in the kit's `icon-standard-rounded`. For places that stand in for the
 * app itself (install prompt, notification previews).
 */
export const AppIcon = (props: ArtProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect fill={EMIT_BLUE} height="1024" rx="229.376" width="1024" />
    <g
      fill={WHITE}
      transform="translate(184.32 198.148) scale(32.157) translate(-4.23 -30.18)"
    >
      {MARK_PATHS.map((d) => (
        <path d={d} key={d} />
      ))}
    </g>
  </svg>
);
