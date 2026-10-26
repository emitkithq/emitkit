# EmitKit

Send product events from your code and get them in a live feed, with push notifications on your phone and desktop.

```bash
curl -X POST https://api.emitkit.com/v1/events \
  -H "Authorization: Bearer emitkit_XXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{"channelName":"payments","title":"New subscription","icon":"💰"}'
```

Or use the SDK (`npm i @emitkit/js`) or the MCP endpoint (`https://api.emitkit.com/mcp`). The API contract is [`openapi/openapi.json`](openapi/openapi.json), also served at `https://api.emitkit.com/openapi.json`.

## How it's built

One Cloudflare Worker serves the public API (`api.`) and the dashboard PWA (`app.`), plus the marketing site and docs when `EMITKIT_SITE_HOST` is set (emitkit.com's deployment; self-hosted ones leave it unset). It uses D1, a Queue, Email Sending, Workers Analytics Engine and Workers AI; the last two can be turned off (`EMITKIT_EVENT_STORE=d1`, `EMITKIT_AI=false`). The backend is Effect TypeScript; the frontends are React with HeroUI v3. Vite with `@cloudflare/vite-plugin` builds everything, and Alchemy provisions and deploys it.

The operator and contributor docs are published at [emitkit.com/docs/self-hosting](https://emitkit.com/docs/self-hosting); the source is `docs/content/self-hosting/`.

| Doc |  |
| --- | --- |
| [Self-hosting](docs/content/self-hosting/index.md) | running EmitKit on your own account |
| [Configuration](docs/content/self-hosting/configuration.md) | every setting, secret and binding |
| [Deployment](docs/content/self-hosting/deployment.md) | deploying on push, Alchemy state, verifying |
| [Recovery](docs/content/self-hosting/recovery.md) | backups, rollbacks, lost state |
| [Architecture](docs/content/self-hosting/architecture.md) | surfaces, modules, data, Effect, oRPC |
| [Development](docs/content/self-hosting/development.md) | local setup, checks, adding features |
| [E2E](e2e/README.md) | scenarios, how to run them, reports |

```bash
pnpm install && pnpm dev        # http://app.localhost:5173
pnpm verify                     # lint + typecheck + build
pnpm release                    # deploy from a laptop (needs .env.local); main deploys itself
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## License

EmitKit is licensed under the [PolyForm Shield License 1.0.0](LICENSE).

> This project is source-available rather than OSI-approved open source. You are welcome to self-host it for personal or internal use, but you may not use it to operate a competing product or service.

What that means in practice (a plain-English summary; the [`LICENSE`](LICENSE) file is the authoritative text and wins wherever the two differ):

- The source code is public. Anyone may clone, read, modify and self-host it.
- Individuals may deploy it to their own infrastructure (Cloudflare, Vercel, their own servers) and use it for free.
- Companies may self-host it for their own internal use.
- Self-hosting does not require buying a commercial license.
- You may not use it to provide a product or service that competes with EmitKit. That includes rebranding or forking it and offering it as your own hosted SaaS, managed service or competing product.
- That restriction applies whether the competing service is paid or free.

For uses outside these terms, a commercial license may be available from the copyright holder: [hi@emitkit.com](mailto:hi@emitkit.com).
