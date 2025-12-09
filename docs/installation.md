# Installation Guide

Complete installation guide for self-hosting EmitKit locally.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** and **pnpm** package manager
- **PostgreSQL database** (Docker recommended for local development)
- **Tinybird account** ([sign up](https://ui.tinybird.co))
- **Git** for cloning the repository
- **Redis** (optional, for SSE - recommended for production)

## Step 1: Clone Repository

Clone the EmitKit repository to your local machine:

```bash
git clone https://github.com/yourusername/blip-sk.git
cd blip-sk
```

## Step 2: Install Dependencies

Install all project dependencies using pnpm:

```bash
pnpm install
```

This will install:

- SvelteKit and Svelte 5
- Drizzle ORM for database
- Better Auth for authentication
- shadcn-svelte UI components
- Tinybird CLI
- All other dependencies

## Step 3: Configure Environment

### 3.1. Copy Environment Template

```bash
cp .env.example .env
```

### 3.2. Configure Database

**Option A: Using Docker (Recommended for Local Development)**

Start PostgreSQL with Docker:

```bash
pnpm run docker:up
```

This starts a PostgreSQL container on port 5433.

Your `.env` should have:

```bash
DATABASE_URL="postgres://root:mysecretpassword@localhost:5433/local"
```

**Option B: Using Existing PostgreSQL**

If you have PostgreSQL already installed, update `.env` with your connection string:

```bash
DATABASE_URL="postgres://user:password@localhost:5432/blip"
```

### 3.3. Generate Authentication Secret

Generate a random secret for Better Auth:

```bash
openssl rand -base64 32
```

Add to `.env`:

```bash
BETTER_AUTH_SECRET="your-generated-secret-here"
BETTER_AUTH_URL="http://localhost:5173"
```

### 3.4. Configure Tinybird

1. Sign up for Tinybird at [ui.tinybird.co](https://ui.tinybird.co)
2. Get your API token from [ui.tinybird.co/tokens](https://ui.tinybird.co/tokens)
3. Add to `.env`:

```bash
TINYBIRD_TOKEN="your-tinybird-token"
TINYBIRD_API_URL="https://api.tinybird.co"
```

### 3.5. Generate VAPID Keys (for Push Notifications)

Generate VAPID keys for web push notifications:

```bash
pnpm dlx web-push generate-vapid-keys
```

Add the output to `.env`:

```bash
PUBLIC_VAPID_KEY="BPx1...xyz"
VAPID_KEY="abc...123"
VAPID_SUBJECT="mailto:your-email@example.com"
```

### 3.6. Optional: OpenAI API Key

If you want AI-powered features (like channel description generation):

```bash
OPENAI_API_KEY="your-openai-api-key"
```

Get from [platform.openai.com](https://platform.openai.com)

### 3.7. Optional: Redis (Upstash)

For production-like SSE (real-time updates), configure Redis:

1. Create free account at [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database
3. Get REST URL and token
4. Add to `.env`:

```bash
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token-here"
```

**Note**: Redis is optional for local development. SSE will fall back to polling without it.

## Step 4: Set Up Database

### 4.1. Push Database Schema

Apply the database schema to your PostgreSQL database:

```bash
pnpm run db:push
```

This creates all necessary tables.

### 4.2. Verify Database Setup

Open Drizzle Studio to verify tables were created:

```bash
pnpm run db:studio
```

Visit `https://local.drizzle.studio` to view your database.

## Step 5: Set Up Tinybird

### 5.1. Authenticate with Tinybird CLI

```bash
cd tinybird
pnpm exec tb login
```

This opens a browser for authentication.

### 5.2. Deploy Tinybird Resources

Deploy data sources and pipes:

```bash
pnpm exec tb deploy
```

This creates:

- Events data source
- Streaming pipes
- Analytics pipes

### 5.3. Verify Tinybird Setup

```bash
pnpm exec tb datasource ls
pnpm exec tb pipe ls
```

You should see `events` datasource and several pipes.

Return to project root:

```bash
cd ..
```

## Step 6: Start Development Server

Start the SvelteKit development server:

```bash
pnpm run dev
```

Visit `http://localhost:5173` to see your app running!

## Step 7: Create Your First User

1. Navigate to `http://localhost:5173`
2. Click "Sign Up" or "Get Started"
3. Create an account with email and password
4. You're ready to start using EmitKit!

## Verification Checklist

After installation, verify everything is working:

- [ ] App loads at `http://localhost:5173`
- [ ] Can create an account and log in
- [ ] Database connection successful (check Drizzle Studio)
- [ ] Can create an organization
- [ ] Can create a site
- [ ] Can create a channel
- [ ] Can create an event
- [ ] Events appear in the channel feed
- [ ] Real-time updates work (SSE)

## Common Issues

### Database connection fails

**Error**: "Connection refused" or "Cannot connect to database"

**Solution**:

- Verify Docker is running: `docker ps`
- Check PostgreSQL is accessible: `psql -U root -h localhost -p 5433 -d local`
- Verify DATABASE_URL in `.env` is correct

### Tinybird deployment fails

**Error**: "Authentication failed" or "Invalid token"

**Solution**:

- Verify TINYBIRD_TOKEN in `.env` is correct
- Check token has admin permissions in [Tinybird Console](https://ui.tinybird.co/tokens)
- Try re-running `pnpm exec tb login`

### Build errors

**Error**: TypeScript errors or missing dependencies

**Solution**:

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Verify Node version (must be 18+)
node --version

# Check for TypeScript errors
pnpm run check
```

### Port already in use

**Error**: "Port 5173 is already in use"

**Solution**:

- Stop other processes using port 5173
- Or change port in `vite.config.ts`:

```typescript
export default defineConfig({
	server: {
		port: 3000 // Change to any available port
	}
});
```

## Next Steps

Now that you have EmitKit installed locally:

1. **Configure**: Review [Configuration Guide](./configuration.md) for all options
2. **Explore**: Create sites, channels, and events to test the platform
3. **Deploy**: When ready, see [Deployment Guide](./deployment.md) for production
4. **Customize**: Modify code and make it your own
5. **Contribute**: See [CONTRIBUTING.md](../CONTRIBUTING.md) if you want to contribute

## Getting Help

If you run into issues:

- Check [Troubleshooting Guide](./troubleshooting.md)
- Review logs in terminal for error messages
- Check browser console for client-side errors
- Visit [GitHub Issues](https://github.com/yourusername/blip-sk/issues)

## Development Tips

### Useful Commands

```bash
# Start development server
pnpm run dev

# Open database GUI
pnpm run db:studio

# Type checking
pnpm run check

# Generate database migrations
pnpm run db:generate

# View Tinybird data
cd tinybird
pnpm exec tb datasource query events "SELECT * FROM events LIMIT 10"
```

### Hot Reload

The dev server supports hot module replacement (HMR):

- Save any `.svelte` file to see changes instantly
- Save any server file to restart the server automatically
- No need to manually refresh browser

### Database Changes

When you modify database schema:

1. Update schema in `src/lib/server/db/schema/`
2. Generate migration: `pnpm run db:generate`
3. Apply changes: `pnpm run db:push`
4. Verify in Drizzle Studio: `pnpm run db:studio`

### Tinybird Changes

When you modify Tinybird resources:

1. Edit `.datasource` or `.pipe` files in `tinybird/`
2. Deploy changes: `cd tinybird && pnpm exec tb deploy`
3. Test pipes: `pnpm exec tb pipe test PIPE_NAME --param key=value`

## Security Reminder

Never commit secrets to Git:

- `.env` is gitignored by default
- Never commit API keys, tokens, or passwords
- Use environment variables for all secrets
- Rotate keys regularly

---

Congratulations! You now have EmitKit running locally. Explore the platform and see [Configuration Guide](./configuration.md) for customization options.
