import { extendTailwindMerge } from "tailwind-merge";
import { createTV } from "tailwind-variants";

/**
 * The design system's own type scale, shadow and tracking tokens (see styles.css).
 * tailwind-merge doesn't know them, so without this it reads `text-caption`
 * as a colour and drops it next to `text-muted`, and keeps `shadow-float` next
 * to `shadow-none`.
 */
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [
        { text: ["caption", "meta", "body", "label", "title", "h2"] },
      ],
      shadow: [{ shadow: ["float", "window", "glow"] }],
      tracking: [{ tracking: ["label"] }],
    },
  },
};

export const twMerge = extendTailwindMerge(twMergeConfig);

export const tv = createTV({ twMergeConfig });
