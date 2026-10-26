import { defineConfig } from "oxlint";
import { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

const DEEP_RELATIVE = {
  group: ["../*", "../**"],
  message:
    "Import through a path alias (@server/*, @shared/*, @worker/*, @app/*, @www/*, @ui/*).",
};

const restrict = (groups: string[], message: string) => ({
  "no-restricted-imports": [
    "error",
    { patterns: [DEEP_RELATIVE, { group: groups, message }] },
  ] as ["error", { patterns: { group: string[]; message: string }[] }],
});

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "e2e/reports/**",
    "web/public/**",
    // Blume generates an Astro project and static output from docs/.
    "docs/.blume/**",
    "docs/dist/**",
  ],
  rules: {
    "no-restricted-imports": ["error", { patterns: [DEEP_RELATIVE] }],
  },
  overrides: [
    {
      // E2E scenarios are ordered steps (sequential awaits are the point),
      // and Playwright hooks take fixtures as `async ({}, testInfo)`.
      files: ["e2e/**/*.ts"],
      rules: { "no-await-in-loop": "off", "no-empty-pattern": "off" },
    },
    {
      // Overrides Node's callback-based dns.lookup.
      files: ["e2e/support/dns.ts"],
      rules: { "promise/prefer-await-to-callbacks": "off" },
    },
    {
      files: ["web/**"],
      rules: restrict(
        ["@server/*", "@worker/*"],
        "Frontends only talk to the Worker over HTTP."
      ),
    },
    {
      files: ["src/shared/**"],
      rules: restrict(
        ["@server/*", "@worker/*", "@app/*", "@www/*", "@ui/*"],
        "Shared contracts must stay dependency-free and browser-safe."
      ),
    },
    {
      files: ["src/server/**"],
      rules: restrict(
        ["@worker/*", "@app/*", "@www/*", "@ui/*"],
        "Backend services never depend on adapters or UI."
      ),
    },
    {
      // Effect idioms that Ultracite's core preset misreads: anonymous
      // `Effect.gen(function* () {})` bodies, `Schema.TaggedError<X>()(...)`
      // class factories, one module grouping a context's tagged errors,
      // `Service.use(...)` (not a React hook) and schema/type name pairs
      // (`const Project = Schema.Struct(...)` + `type Project`).
      files: ["src/**/*.ts", "scripts/**/*.ts", "alchemy.run.ts"],
      rules: {
        "func-names": "off",
        "max-classes-per-file": "off",
        "no-redeclare": "off",
        "react-hooks/rules-of-hooks": "off",
        "unicorn/throw-new-error": "off",
      },
    },
    {
      // Effect-native backend code. See docs/content/self-hosting/architecture.md#linting for the
      // two relaxed rules and why.
      files: ["src/server/**/*.ts"],
      jsPlugins: ["oxlint-plugin-effect/plugin"],
      rules: {
        ...effectRecommended,
        complexity: ["error", { max: 21 }],
        "effect/maxCognitiveComplexity": ["error", { max: 21 }],
        "effect/maxHalsteadDifficulty": ["error", { max: 79 }],
        "effect/noNullish": "off",
        "effect/noTernary": "off",
      },
    },
    {
      // Named host-boundary adapters (Cloudflare bindings, Better Auth,
      // WebCrypto, fetch). The Effect plugin README prescribes exactly this.
      files: ["src/server/platform/**/*.ts"],
      jsPlugins: ["oxlint-plugin-effect/plugin"],
      rules: {
        "effect/noGlobals": "off",
        "effect/noAsyncFunction": "off",
        "effect/noNewPromise": "off",
      },
    },
    {
      // Better Auth infers its endpoint types from literal plugin tuples and
      // access-control statements (`as const`), and its hooks reject a
      // request by throwing `APIError`.
      files: [
        "src/server/platform/auth-options.ts",
        "src/server/platform/dev-sign-in.ts",
      ],
      jsPlugins: ["oxlint-plugin-effect/plugin"],
      rules: {
        "effect/noAs": "off",
        "effect/noNewError": "off",
        "effect/noThrowStatement": "off",
      },
    },
  ],
});
