# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you build it.

## Setup

[Development](docs/content/self-hosting/development.md) covers local setup: `pnpm install`, local D1, a VAPID pair and `pnpm dev`. Copy `.dev.vars.example` to `.dev.vars` for local secrets. Read [Architecture](docs/content/self-hosting/architecture.md) before adding modules, routes, bindings or dependencies, and `AGENTS.md` for the code rules (Effect on the backend, path aliases, module boundaries).

## Before you open a pull request

```bash
pnpm verify    # lint (Ultracite/Oxlint), typecheck, production build
```

Tests are end-to-end only (see [e2e/README.md](e2e/README.md)). Add or extend a scenario for behaviour you change, and run it against `pnpm dev`.

Keep features that only emitkit.com needs (billing, telemetry, the marketing site) behind settings that default to off, so a plain clone still self-hosts.

## License of contributions

EmitKit is licensed under [PolyForm Shield 1.0.0](LICENSE), and a commercial license is offered separately. By opening a pull request you agree that your contribution is licensed under the same terms, and that the copyright holder may also license it under other terms, including commercial ones.
