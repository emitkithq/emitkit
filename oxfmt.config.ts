import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Vendored agent skills, the published API contract (kept byte-stable for
  // SDK sync), generated route trees and E2E report artifacts are not ours
  // to reformat.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".agents/**",
    ".claude/**",
    "openapi/**",
    "**/route-tree.gen.ts",
    "e2e/reports/**",
    // Blume MDX (`:::` directives, fenced code in <CodeGroup>) doesn't survive
    // oxfmt's Markdown formatting.
    "docs/content/**/*.mdx",
    "docs/.blume/**",
    "docs/dist/**",
  ],
});
