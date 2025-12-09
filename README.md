# EmitKit

Open-source event streaming platform with real-time notifications, webhooks, and integrations. Built with SvelteKit and Svelte 5.

## Features

- **Real-time Event Streaming**: SSE-based live updates with Tinybird (ClickHouse) backend
- **Multi-tenancy**: Organization → Project → Channel → Events hierarchy
- **Push Notifications**: Web Push API with VAPID support for browser notifications
- **Webhooks**: Reliable HTTP POST dispatching with HMAC signatures and retry logic
- **Integrations**: Slack, Discord, and Email notifications out of the box
- **Type-Safe API**: End-to-end TypeScript with Zod validation
- **Production-Ready**: Durable side-effect execution with QStash
- **Modern UI**: shadcn-svelte components with Tailwind CSS
- **Self-Hostable**: Deploy to Vercel, any Node.js host, or Docker

## Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) with [Svelte 5](https://svelte.dev/)
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Event Storage**: [Tinybird](https://www.tinybird.co/)
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **Styling**: [shadcn-svelte](https://www.shadcn-svelte.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **Package Manager**: pnpm

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Tinybird account (for event storage)
- Redis (optional, for caching)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/emitkithq/emitkit.git
cd emitkit
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy the environment example and configure:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

- Database connection string
- Better Auth secret
- Tinybird API token
- VAPID keys for push notifications (run `pnpm run generate:vapid`)

4. Set up the database:

```bash
pnpm run db:push
```

5. Set up Tinybird:

```bash
cd tinybird
tb auth
tb push --force
```

6. Start the development server:

```bash
pnpm run dev
```

Visit `http://localhost:5173` to see your app.

## Available Commands

```bash
# Development
pnpm run dev              # Start dev server
pnpm run build            # Build for production
pnpm run preview          # Preview production build

# Database
pnpm run db:studio        # Open Drizzle Studio
pnpm run db:generate      # Generate migrations
pnpm run db:push          # Push schema changes

# Docker
pnpm run docker:up        # Start services (Postgres, Redis)
pnpm run docker:down      # Stop services

# Code Quality (for contributors)
pnpm run check            # TypeScript type checking
pnpm run lint             # ESLint + Prettier
pnpm run format           # Format code with Prettier
```

## Documentation

### For Self-Hosting

- **[Installation Guide](./docs/installation.md)** - Step-by-step setup instructions
- **[Configuration](./docs/configuration.md)** - Environment variables and secrets
- **[Deployment](./docs/deployment.md)** - Deploy to production (Vercel)
- **[Tinybird Setup](./docs/tinybird.md)** - Event storage configuration
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

### For Contributors

- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
- **[Development Docs](./CLAUDE.md)** - Architecture and development patterns

## Configuration

See [Configuration Guide](./docs/configuration.md) for complete environment variable documentation.

### Quick Setup

1. Copy `.env.example` to `.env`
2. Fill in required values (database, auth secret, Tinybird token)
3. Generate VAPID keys for push notifications: `pnpm dlx web-push generate-vapid-keys`

For detailed configuration options, see the [Configuration Guide](./docs/configuration.md).

## Deployment

See [Deployment Guide](./docs/deployment.md) for complete production deployment instructions.

### Quick Deploy to Vercel

1. Push your code to GitHub
2. Import to Vercel
3. Set environment variables (see [Configuration Guide](./docs/configuration.md))
4. Deploy

For detailed deployment steps, troubleshooting, and production best practices, see the [Deployment Guide](./docs/deployment.md).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

**Quick steps:**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm run check` (must pass with 0 errors)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/) and [Svelte 5](https://svelte.dev/)
- UI components from [shadcn-svelte](https://www.shadcn-svelte.com/)
- Authentication powered by [Better Auth](https://www.better-auth.com/)
- Event analytics by [Tinybird](https://www.tinybird.co/)

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/blip-sk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/blip-sk/discussions)
- **Documentation**: [docs/](./docs/)

---

Made with ❤️ by the EmitKit community
