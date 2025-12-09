# Production Deployment Guide

Complete guide for deploying EmitKit to Vercel with Neon PostgreSQL, Redis, PWA, and Push Notifications.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Environment Variables](#environment-variables)
4. [Deployment Steps](#deployment-steps)
5. [Post-Deployment Configuration](#post-deployment-configuration)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Vercel Account**: [vercel.com](https://vercel.com)
- **Neon Account**: [neon.tech](https://neon.tech)
- **Upstash Account** (recommended): [upstash.com](https://upstash.com)
- **Git Repository**: Code pushed to GitHub/GitLab/Bitbucket
- **Node.js 20+**: For local testing
- **pnpm**: Package manager

---

## Infrastructure Setup

### 1. Neon PostgreSQL Database

#### Create Neon Project

1. Go to [console.neon.tech](https://console.neon.tech)
2. Click "New Project"
3. Name: `blip-production`
4. Region: Choose closest to Vercel region (e.g., `us-east-1`)
5. Click "Create Project"

#### Get Connection String

1. In project dashboard, click "Connection string"
2. Copy the **Pooled connection** string
3. Format: `postgres://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require&pooling=true`
4. Save for later (will be `DATABASE_URL`)

#### Run Migrations

```bash
# Set DATABASE_URL locally
export DATABASE_URL="your-neon-connection-string"

# Generate and push schema
pnpm run db:generate
pnpm run db:push
```

### 2. Redis (Upstash)

**Why Upstash?** HTTP-based Redis perfect for serverless (no connection pooling issues).

#### Create Upstash Redis Database

1. Go to [console.upstash.com](https://console.upstash.com)
2. Click "Create Database"
3. Name: `blip-production`
4. Type: Regional
5. Region: Same as Vercel (e.g., `us-east-1`)
6. Click "Create"

#### Get Connection String

1. In database dashboard, go to "Details" tab
2. Copy **REST URL** or **Redis connection string**
3. Format: `rediss://default:password@your-redis.upstash.io:6379`
4. Save for later (will be `REDIS_URL`)

### 3. Generate VAPID Keys

VAPID keys allow your server to send push notifications.

```bash
# Generate keys
pnpm dlx web-push generate-vapid-keys

# Output:
# Public Key: BL...
# Private Key: xyz...
```

**Save both keys securely!** You'll need them for environment variables.

---

## Environment Variables

For a complete list of environment variables and their configuration, see [Configuration Guide](./configuration.md).

### Quick Checklist

Set these in Vercel Project Settings → Environment Variables:

- [ ] `DATABASE_URL` - Neon pooled connection string
- [ ] `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- [ ] `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- [ ] `VERCEL_URL` - Your Vercel app URL
- [ ] `BETTER_AUTH_SECRET` - Random 32-byte secret (generate: `openssl rand -base64 32`)
- [ ] `PUBLIC_VAPID_KEY` - VAPID public key
- [ ] `VAPID_KEY` - VAPID private key
- [ ] `VAPID_SUBJECT` - Your contact email
- [ ] `TINYBIRD_TOKEN` - Tinybird API token
- [ ] `OPENAI_API_KEY` - OpenAI API key (optional)

---

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Select "SvelteKit" framework
4. Don't deploy yet!

### 2. Configure Project Settings

#### Build & Development Settings

- **Framework Preset**: SvelteKit
- **Build Command**: `pnpm run build`
- **Install Command**: `pnpm install`
- **Output Directory**: `.svelte-kit` (leave default)

#### Root Directory

- Leave as root (unless monorepo)

### 3. Add Environment Variables

1. Go to Project Settings → Environment Variables
2. Add all variables from [Environment Variables](#environment-variables) section
3. Set environment: **Production** (and Preview if needed)

### 4. Deploy

```bash
# Option 1: Deploy via Vercel Dashboard
# Click "Deploy" button

# Option 2: Deploy via CLI
vercel --prod
```

### 5. Verify Deployment

1. Wait for build to complete (~2-3 minutes)
2. Visit your production URL
3. Check logs for errors: Project → Deployments → [Latest] → Logs

---

## Post-Deployment Configuration

### 1. Update Environment Variables

If you used a placeholder domain, update these after first deployment:

```bash
VERCEL_URL="https://your-actual-domain.vercel.app"
BETTER_AUTH_URL="https://your-actual-domain.vercel.app"
```

Then redeploy:

```bash
vercel --prod
```

### 2. Test Database Connection

Visit: `https://your-app.vercel.app/api/healthcheck` (create this endpoint if needed)

Or check Vercel logs for database connection messages.

### 3. Test Redis Connection

Create a test event and verify it broadcasts via SSE.

### 4. Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS setup instructions
4. Update `VERCEL_URL` environment variable
5. Redeploy

---

## Testing

### Test PWA Installation

#### Desktop (Chrome)

1. Visit your production URL
2. Look for install icon in address bar (⊕)
3. Click to install
4. Verify app opens in standalone window

#### Mobile (iPhone/Android)

1. Visit your production URL in Safari/Chrome
2. Tap Share → Add to Home Screen
3. Tap icon on home screen
4. Verify app opens fullscreen (no browser UI)

### Test Push Notifications

#### 1. Subscribe to Notifications

```javascript
// In browser console on your production site
const { subscribeToPush, getPublicVapidKey } =
	await import('$lib/features/notifications/notifications.remote.ts');

// Get VAPID public key
const { publicKey } = await getPublicVapidKey();

// Register service worker and subscribe
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
	userVisibleOnly: true,
	applicationServerKey: publicKey
});

// Save subscription
await subscribeToPush({
	endpoint: subscription.endpoint,
	p256dhKey: subscription.keys.p256dh,
	authKey: subscription.keys.auth,
	channelIds: ['your-channel-id']
});
```

#### 2. Create Test Event

```bash
curl -X POST https://your-app.vercel.app/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "your-channel-id",
    "organizationId": "your-org-id",
    "title": "Test Notification",
    "description": "Testing push notifications",
    "notify": true
  }'
```

#### 3. Verify Notification Received

- Should see notification on your device
- Click notification → should open app to channel

---

## Troubleshooting

### Database Connection Issues

**Error**: `Connection timeout` or `Failed to connect`

**Solutions**:

1. Verify `DATABASE_URL` includes `?sslmode=require&pooling=true`
2. Check Neon database is not suspended (free tier auto-suspends)
3. Verify Vercel region matches Neon region for lower latency

### Redis Connection Issues

**Error**: `Redis connection failed`

**Solutions**:

1. Verify `REDIS_URL` is correct (should start with `rediss://`)
2. Check Upstash database is active
3. Try regenerating Upstash password

### SSE Not Working

**Error**: Events not streaming to clients

**Solutions**:

1. Check Redis pub/sub is working (`REDIS_URL` configured)
2. Verify `vercel.json` has SSE headers configured
3. Check Vercel function logs for errors
4. Ensure `X-Accel-Buffering: no` header is set

### Push Notifications Not Working

**Error**: Notifications not received

**Solutions**:

1. Verify VAPID keys are correct (PUBLIC_VAPID_KEY must match subscription)
2. Check browser console for service worker errors
3. Verify subscription was saved to database
4. Test with `notify: true` on event creation
5. Check Vercel function logs for web-push errors

**Error**: `UnauthorizedRegistration`

**Solution**: VAPID keys mismatch. Regenerate subscription with correct public key.

### PWA Not Installing

**Error**: No install prompt on mobile/desktop

**Solutions**:

1. Verify site is served over HTTPS (Vercel does this automatically)
2. Check `manifest.json` is accessible at `/manifest.json`
3. Verify service worker is registered (check DevTools → Application → Service Workers)
4. Clear cache and try again
5. Check PWA icons exist at `/static/pwa-*.svg`

### Build Failures

**Error**: `Type error` or build fails

**Solutions**:

1. Run `pnpm run check` locally
2. Ensure all dependencies are in `package.json` (not just devDependencies)
3. Check Node.js version matches (should be 20+)
4. Clear Vercel cache: Project Settings → General → Clear Cache

---

## Production Checklist

Before going live:

- [ ] Database migrations applied
- [ ] All environment variables configured
- [ ] Better Auth secret is random and secure
- [ ] VAPID keys generated and configured
- [ ] PWA icons created (replace placeholders)
- [ ] Tested PWA installation on real device
- [ ] Tested push notifications end-to-end
- [ ] Custom domain configured (if applicable)
- [ ] Monitoring/error tracking setup (optional: Sentry)
- [ ] Backup strategy for database
- [ ] Rate limiting configured on API endpoints (optional)

---

## Performance Optimization

### Database Query Optimization

- Add indexes to frequently queried columns
- Use Drizzle's `with` for eager loading relations
- Implement pagination for large lists

### Redis Optimization

- Use Upstash Redis for zero cold starts
- Consider Redis caching for expensive queries
- Monitor Redis memory usage

### SSE Connection Management

- Limit concurrent SSE connections per user
- Implement reconnection logic on client
- Add heartbeat/keepalive messages

---

## Security Best Practices

1. **API Authentication**: Ensure all API endpoints check authentication
2. **Rate Limiting**: Add rate limiting to prevent abuse
3. **Input Validation**: Use Zod schemas for all user input
4. **CORS Configuration**: Restrict CORS to known domains in production
5. **Secret Management**: Never commit secrets to Git
6. **Database Security**: Use parameterized queries (Drizzle does this automatically)

---

## Monitoring

### Key Metrics to Monitor

1. **Vercel Analytics**: Page views, performance
2. **Database**: Connection pool usage, query performance
3. **Redis**: Memory usage, pub/sub messages
4. **Push Notifications**: Delivery rate, failures
5. **Error Rate**: Track 5xx errors

### Recommended Tools

- **Vercel Analytics**: Built-in
- **Neon Monitoring**: Database metrics
- **Upstash Monitoring**: Redis metrics
- **Sentry** (optional): Error tracking

---

## Scaling Considerations

### Current Architecture Supports

- **Users**: 1-1000 concurrent users
- **Events**: ~100 events/second
- **SSE Connections**: ~500 concurrent connections per region
- **Push Notifications**: Thousands per minute

### When to Scale

- **Add More Regions**: If users are globally distributed
- **Upgrade Database**: If >10GB data or high query load
- **Add Caching**: Redis caching for frequently accessed data
- **Queue System**: BullMQ + Redis for background jobs

---

## Support & Resources

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Neon Docs**: [neon.tech/docs](https://neon.tech/docs)
- **Upstash Docs**: [upstash.com/docs](https://upstash.com/docs)
- **SvelteKit Docs**: [kit.svelte.dev](https://kit.svelte.dev)
- **Web Push Docs**: [web.dev/push-notifications](https://web.dev/push-notifications)

---

## Quick Reference

### Useful Commands

```bash
# Local development
pnpm run dev

# Type check
pnpm run check

# Database commands
pnpm run db:generate  # Generate migrations
pnpm run db:push      # Push to database
pnpm run db:studio    # Open Drizzle Studio

# Deploy
vercel --prod

# View logs
vercel logs --prod

# Environment variables
vercel env ls
vercel env add VARIABLE_NAME production
```

### Important URLs

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Neon Console**: https://console.neon.tech
- **Upstash Console**: https://console.upstash.com
- **Your App**: https://your-app.vercel.app

---

## Next Steps

After successful deployment:

1. **Create Production Data**: Add channels, test events
2. **Monitor Performance**: Watch Vercel Analytics for issues
3. **User Testing**: Install PWA on real devices and test
4. **Documentation**: Update team on how to create events via API
5. **Iterate**: Based on usage, optimize and add features

---

## Need Help?

If you encounter issues not covered here:

1. Check Vercel deployment logs
2. Check Neon/Upstash dashboards for errors
3. Test locally with production environment variables
4. Review [troubleshooting section](#troubleshooting)

Good luck with your deployment! 🚀
