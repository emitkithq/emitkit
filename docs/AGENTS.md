# Customer documentation

`docs/` is the public EmitKit documentation and changelog, built with Blume and served by the EmitKit Worker at `<site>/docs`. `content/self-hosting/` holds the operator and contributor docs (self-hosting, configuration, deployment, recovery, architecture, development), published for self-hosters. `internal/` sits outside `content/` and is never published.

## Shipping contract

- Update the relevant guide in the same commit as a customer-visible behavior change. Add a changelog entry when the change matters to customers.
- Content on `main` describes production. Check claims against the code (`src/server`, `openapi/openapi.json`), not against older versions of EmitKit.
- Write outcomes and workflows in customer language. Keep EmitKit-only operations (our accounts, cutover history) in `internal/`, and secrets out of both.

## Changelog

- Put entries under `content/changelog/` with `type: changelog`, an ISO date, a concise customer-facing title and description, and a category.
- Group related changes into one release note. Describe what customers can do or what got better, not the commits.

## Operation

- Read the docs bundled in the installed `blume` package (`node_modules/blume/docs`) before changing configuration or advanced content.
- Write links as if mounted at the root (`/getting-started`). Blume adds the `/docs` base (`deployment.base` in `blume.config.ts`).
- `content/` and `blume.config.ts` are the source. `.blume/` and `dist/` are generated and stay out of git.
- Before committing, run `pnpm --filter @emitkit/docs validate` and `pnpm --filter @emitkit/docs build`. The root `pnpm verify` runs both.
