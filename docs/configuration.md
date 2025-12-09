# Configuration Guide

Complete guide to configuring EmitKit for self-hosting.

## Environment Variables

All configuration is done through environment variables. Copy `.env.example` to `.env` and fill in the values.

### Required Variables

#### Application URLs

```bash
VERCEL_URL=http://localhost:5173
```

- **Description**: The URL where your application is accessible
- **Local**: `http://localhost:5173`
- **Production**: Your Vercel domain (e.g., `https://your-app.vercel.app`)

#### Database (PostgreSQL)

```bash
DATABASE_URL="postgres://user:password@host:port/database?sslmode=require&pooling=true"
```

- **Description**: PostgreSQL connection string
- **Local**: Use Docker Postgres (see Installation Guide)
- **Production**: Use Neon pooled connection string
- **Example**: `postgres://root:mysecretpassword@localhost:5433/local`

#### Authentication (Better Auth)

```bash
BETTER_AUTH_SECRET="your-secret-here"
BETTER_AUTH_URL="${VERCEL_URL}"
```

- **BETTER_AUTH_SECRET**: Random secret for session encryption
- **Generate**: `openssl rand -base64 32`
- **BETTER_AUTH_URL**: Usually same as `VERCEL_URL`

### Optional Variables

#### Redis (Upstash - For SSE in Production)

```bash
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token-here"
```

- **Description**: Redis for real-time event streaming
- **Get from**: [console.upstash.com](https://console.upstash.com)
- **Required for**: Production SSE (Server-Sent Events)
- **Local**: Optional (polling fallback works)

#### AI / LLM Integration

```bash
OPENAI_API_KEY="your-openai-api-key-here"
```

- **Description**: OpenAI API key for AI-powered features
- **Get from**: [platform.openai.com](https://platform.openai.com)
- **Required for**: Channel description generation

#### Tinybird (Events & Analytics)

```bash
TINYBIRD_TOKEN="your-tinybird-token-here"
TINYBIRD_API_URL="https://api.tinybird.co"
```

- **Description**: Event storage and analytics backend
- **Get from**: [ui.tinybird.co/tokens](https://ui.tinybird.co/tokens)
- **See**: [Tinybird Setup Guide](./tinybird.md) for details

#### Push Notifications (VAPID)

```bash
PUBLIC_VAPID_KEY="YOUR_PUBLIC_VAPID_KEY"
VAPID_KEY="YOUR_VAPID_KEY"
VAPID_SUBJECT="mailto:your-email@example.com"
```

- **Description**: Keys for web push notifications
- **See**: [Generating VAPID Keys](#generating-vapid-keys) below

#### Monitoring (Optional)

```bash
SENTRY_DSN="your-sentry-dsn"
```

- **Description**: Error tracking and monitoring
- **Get from**: [sentry.io](https://sentry.io)

---

## Generating VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for sending Web Push notifications.

### Quick Generate

```bash
pnpm dlx web-push generate-vapid-keys
```

### Output

```
=======================================

Public Key:
BPx1...xyz

Private Key:
abc...123

=======================================
```

### Add to Environment

#### Local Development

Add to `.env`:

```bash
PUBLIC_VAPID_KEY="BPx1...xyz"
VAPID_KEY="abc...123"
VAPID_SUBJECT="mailto:your-email@example.com"
```

#### Production (Vercel)

1. Go to Vercel Project Settings → Environment Variables
2. Add:
   - `PUBLIC_VAPID_KEY` = `BPx1...xyz`
   - `VAPID_KEY` = `abc...123`
   - `VAPID_SUBJECT` = `mailto:your-email@example.com`
3. Redeploy

### What are VAPID Keys?

VAPID keys allow push notification services to identify your server. They consist of:

- **Public Key**: Shared with browsers when subscribing to notifications
- **Private Key**: Kept secret on your server, used to sign push requests
- **Subject**: Contact email or URL for your application

### Troubleshooting VAPID Keys

#### Keys not working?

- Verify `PUBLIC_VAPID_KEY` starts with `B` (Base64 encoded)
- Ensure no extra whitespace in environment variables
- Check both keys were copied completely
- Restart dev server after adding keys

#### Need to regenerate?

```bash
# Generate new keys
pnpm dlx web-push generate-vapid-keys

# Update .env and Vercel
# Note: Users will need to re-subscribe to notifications
```

---

## Logging Configuration

The logging system is pre-configured for development and production. Configuration is optional.

### Environment Variables

```bash
# Optional: Sentry DSN for error tracking
SENTRY_DSN="https://your-sentry-dsn@sentry.io/123456"

# Node environment (automatically set in production)
NODE_ENV=production
```

### Sentry Configuration

Edit `/src/lib/server/logger/sentry.ts` to customize:

```typescript
Sentry.init({
	dsn: sentryDsn,
	environment: process.env.NODE_ENV || 'production',
	tracesSampleRate: 0.1, // 10% of requests
	replaysSessionSampleRate: 0.01, // 1% of sessions
	replaysOnErrorSampleRate: 1.0 // 100% of error sessions
});
```

### Log Levels

The system automatically adjusts log levels based on environment:

- **Development**: All levels (info, warn, error, success)
- **Production**: Errors and warnings only (unless explicitly configured)

---

## Security Notes

### Never Commit Secrets

- Add `.env` to `.gitignore` (already configured)
- Use environment variables in production
- Never commit API keys, tokens, or secrets to Git

### Rotate Keys Regularly

- Database passwords
- API tokens
- VAPID keys (requires re-subscribing users)
- Better Auth secrets

### Production Checklist

- [ ] All secrets are stored in Vercel environment variables
- [ ] `.env` is not committed to Git
- [ ] VAPID keys are generated and stored securely
- [ ] Database uses SSL (`sslmode=require`)
- [ ] Better Auth secret is random (32+ bytes)
- [ ] API tokens have minimal required permissions

---

## Environment File Template

Complete `.env.example` for reference:

```bash
# =============================================================================
# Environment Configuration
# =============================================================================

# -----------------------------------------------------------------------------
# Application URLs
# -----------------------------------------------------------------------------
VERCEL_URL=http://localhost:5173

# -----------------------------------------------------------------------------
# Database (Neon PostgreSQL)
# -----------------------------------------------------------------------------
DATABASE_URL="postgres://root:mysecretpassword@localhost:5433/local"

# -----------------------------------------------------------------------------
# Redis (Upstash - Required for SSE pub/sub in production)
# -----------------------------------------------------------------------------
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token-here"

# -----------------------------------------------------------------------------
# Authentication (Better Auth)
# -----------------------------------------------------------------------------
# Generate: openssl rand -base64 32
# BETTER_AUTH_SECRET="your-secret-here"
# BETTER_AUTH_URL="${VERCEL_URL}"

# -----------------------------------------------------------------------------
# AI / LLM Integration
# -----------------------------------------------------------------------------
OPENAI_API_KEY="your-openai-api-key-here"

# -----------------------------------------------------------------------------
# Web Push Notifications (VAPID Keys)
# -----------------------------------------------------------------------------
# Generate: pnpm dlx web-push generate-vapid-keys
# PUBLIC_VAPID_KEY="YOUR_PUBLIC_VAPID_KEY"
# VAPID_KEY="YOUR_VAPID_KEY"
# VAPID_SUBJECT="mailto:your-email@example.com"

# -----------------------------------------------------------------------------
# Tinybird (Events & Analytics)
# -----------------------------------------------------------------------------
TINYBIRD_TOKEN="your-tinybird-token-here"
TINYBIRD_API_URL="https://api.tinybird.co"

# -----------------------------------------------------------------------------
# Optional: Analytics & Monitoring
# -----------------------------------------------------------------------------
# SENTRY_DSN="your-sentry-dsn"
```

---

## Next Steps

- [Installation Guide](./installation.md) - Set up your development environment
- [Deployment Guide](./deployment.md) - Deploy to production
- [Tinybird Setup](./tinybird.md) - Configure event storage
- [Troubleshooting](./troubleshooting.md) - Common issues
