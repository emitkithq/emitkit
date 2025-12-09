# Troubleshooting Guide

Common issues when self-hosting EmitKit and how to resolve them.

## Database Connection Issues

### Error: Connection timeout or Failed to connect

**Symptoms:**

- Application fails to start
- Database queries hang
- "Connection refused" errors

**Solutions:**

1. **Verify connection string format**:

   ```bash
   DATABASE_URL="postgres://user:password@host:port/database?sslmode=require&pooling=true"
   ```

2. **Check database is running**:
   - Neon: Database may be suspended (free tier auto-suspends)
   - Docker: Run `docker ps` to verify Postgres container is running

3. **Verify SSL mode**:
   - Production (Neon): Must include `?sslmode=require&pooling=true`
   - Local (Docker): Can use `?sslmode=disable`

4. **Check network/firewall**:
   - Verify Vercel can reach your database
   - Check database firewall rules
   - Ensure database allows connections from Vercel IPs

---

## Redis Connection Issues

### Error: Redis connection failed

**Symptoms:**

- SSE (real-time updates) not working
- "Cannot connect to Redis" errors
- Timeout errors

**Solutions:**

1. **Verify Redis URL format**:

   ```bash
   UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
   UPSTASH_REDIS_REST_TOKEN="your-token-here"
   ```

2. **Check Upstash database is active**:
   - Visit [console.upstash.com](https://console.upstash.com)
   - Verify database status is "Active"

3. **Regenerate credentials**:
   - In Upstash Console, go to database details
   - Copy new REST URL and token
   - Update environment variables

4. **Redis is optional for development**:
   - Local dev works without Redis (uses polling fallback)
   - Only required for production SSE

---

## Tinybird Errors

### Error: Authentication failed

**Symptoms:**

- Events not being stored
- "Unauthorized" or "Invalid token" errors
- 401 responses from Tinybird API

**Solutions:**

1. **Verify token is correct**:

   ```bash
   TINYBIRD_TOKEN="your-tinybird-token"
   ```

2. **Check token permissions**:
   - Visit [ui.tinybird.co/tokens](https://ui.tinybird.co/tokens)
   - Ensure token has admin or write permissions
   - Regenerate if needed

3. **Verify API URL**:

   ```bash
   TINYBIRD_API_URL="https://api.tinybird.co"
   ```

4. **Check deployment**:
   ```bash
   cd tinybird
   pnpm exec tb datasource ls
   pnpm exec tb pipe ls
   ```

See [Tinybird Setup Guide](./tinybird.md) for more details.

### Error: No events showing

**Symptoms:**

- Events created but don't appear in UI
- Empty results from queries

**Solutions:**

1. **Check retention tier filtering**:
   - Events are filtered based on organization's retention tier
   - Basic: 90 days, Premium: 365 days, Unlimited: no limit

2. **Verify event ingestion**:

   ```bash
   pnpm exec tb datasource query events "SELECT count() FROM events"
   ```

3. **Check date range**:
   - Ensure query date range includes event creation time
   - Check `created_at` timestamp is correct

4. **Verify organization and channel IDs**:
   - Ensure `organization_id` and `channel_id` are correct
   - Check events are associated with the right organization

---

## Push Notifications Issues

### Error: Notifications not received

**Symptoms:**

- No notification popup
- Subscription succeeds but no notifications
- Silent failures

**Solutions:**

1. **Verify VAPID keys are correct**:

   ```bash
   PUBLIC_VAPID_KEY="BPx1...xyz"  # Must start with 'B'
   VAPID_KEY="abc...123"
   VAPID_SUBJECT="mailto:your-email@example.com"
   ```

2. **Check browser permissions**:
   - Ensure notifications are allowed in browser settings
   - Check for blocked notifications in site settings

3. **Verify service worker is registered**:
   - Open DevTools → Application → Service Workers
   - Check service worker status is "activated"
   - Try unregister and re-register

4. **Check notification payload**:
   - Verify `notify: true` is set when creating events
   - Check server logs for push notification errors

5. **Test with curl**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/v1/events \
     -H "Content-Type: application/json" \
     -d '{"channelId": "ch_123", "organizationId": "org_123", "title": "Test", "notify": true}'
   ```

See [Configuration Guide](./configuration.md#generating-vapid-keys) for more details.

### Error: UnauthorizedRegistration

**Symptoms:**

- "UnauthorizedRegistration" error in console
- Push subscription fails

**Solutions:**

1. **VAPID keys mismatch**:
   - Public key used for subscription doesn't match private key on server
   - Regenerate VAPID keys and update both client and server
   - Users will need to re-subscribe

2. **Clear old subscriptions**:
   ```javascript
   // In browser console
   const registration = await navigator.serviceWorker.ready;
   const subscription = await registration.pushManager.getSubscription();
   await subscription.unsubscribe();
   // Then re-subscribe with new keys
   ```

---

## PWA Installation Issues

### Error: No install prompt on mobile/desktop

**Symptoms:**

- Install button doesn't appear
- "Add to Home Screen" not showing
- PWA criteria not met

**Solutions:**

1. **Verify HTTPS**:
   - PWAs require HTTPS (Vercel provides this automatically)
   - Check site is served over `https://`

2. **Check manifest.json**:
   - Visit `https://your-app.vercel.app/manifest.json`
   - Verify it returns valid JSON
   - Check all required fields are present

3. **Verify service worker**:
   - Open DevTools → Application → Service Workers
   - Check service worker is registered and active
   - Look for service worker errors

4. **Check PWA icons**:
   - Verify icons exist at `/static/pwa-*.svg`
   - Check icon sizes are correct
   - Replace placeholder icons with your brand

5. **Clear cache and retry**:
   - Clear browser cache
   - Reload page (Ctrl+Shift+R / Cmd+Shift+R)
   - Try again

6. **Check browser compatibility**:
   - Safari (iOS): Limited PWA support
   - Chrome/Edge: Full PWA support
   - Firefox: Partial PWA support

---

## Build Failures

### Error: TypeScript errors during build

**Symptoms:**

- `pnpm run build` fails
- Type errors in console
- Vercel deployment fails

**Solutions:**

1. **Run type check locally**:

   ```bash
   pnpm run check
   ```

2. **Fix type errors**:
   - Address all TypeScript errors
   - Ensure no `any` types (unless necessary)
   - Zero errors required for deployment

3. **Check dependencies**:

   ```bash
   rm -rf node_modules
   pnpm install
   ```

4. **Verify Node.js version**:
   - Requires Node.js 18+
   - Check with `node --version`

5. **Clear Vercel cache**:
   - Go to Project Settings → General
   - Click "Clear Cache"
   - Redeploy

### Error: Module not found

**Symptoms:**

- "Cannot find module" errors
- Import errors during build

**Solutions:**

1. **Check package.json**:
   - Ensure all dependencies are listed
   - Use `dependencies` (not `devDependencies`) for production packages

2. **Reinstall dependencies**:

   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

3. **Check import paths**:
   - Use absolute imports with `$lib` alias
   - Verify file paths are correct
   - Check for case-sensitive path issues

---

## SSE (Server-Sent Events) Issues

### Error: Events not streaming to clients

**Symptoms:**

- Live updates not working
- Events appear only on page refresh
- SSE connection fails

**Solutions:**

1. **Check Redis is configured** (production only):

   ```bash
   UPSTASH_REDIS_REST_URL="..."
   UPSTASH_REDIS_REST_TOKEN="..."
   ```

2. **Verify SSE headers**:
   - Check `vercel.json` has SSE configuration
   - Ensure `X-Accel-Buffering: no` header is set

3. **Check browser support**:
   - SSE works in all modern browsers
   - Check browser console for errors

4. **Test endpoint directly**:

   ```bash
   curl -N https://your-app.vercel.app/[site_id]/[channel_id]/stream
   ```

5. **Check Vercel function logs**:
   - Go to Vercel → Deployments → [Latest] → Logs
   - Look for SSE-related errors

---

## Performance Issues

### Error: Slow page loads or queries

**Symptoms:**

- Pages take long to load
- Database queries are slow
- High response times

**Solutions:**

1. **Database optimization**:
   - Add indexes to frequently queried columns
   - Use `EXPLAIN` to analyze slow queries
   - Consider database plan upgrade

2. **Tinybird optimization**:
   - Check query patterns match sorting keys
   - Use materialized views for aggregations
   - Filter by organization_id first

3. **Enable caching** (Redis):
   - Configure Redis for frequently accessed data
   - Implement cache-aside pattern
   - Set appropriate TTLs

4. **Check Vercel region**:
   - Ensure Vercel region matches database region
   - Use edge functions for static content

---

## Authentication Issues

### Error: Cannot log in or session expired

**Symptoms:**

- Login fails silently
- Session expires immediately
- Redirected to login repeatedly

**Solutions:**

1. **Check Better Auth secret**:

   ```bash
   BETTER_AUTH_SECRET="your-secret-here"
   ```

   - Must be at least 32 bytes
   - Generate: `openssl rand -base64 32`

2. **Verify Better Auth URL**:

   ```bash
   BETTER_AUTH_URL="https://your-app.vercel.app"
   ```

   - Must match your actual domain
   - No trailing slash

3. **Check cookies**:
   - Ensure cookies are not blocked
   - Check browser privacy settings
   - Verify domain allows third-party cookies (if using custom domain)

4. **Clear cookies and try again**:
   - Clear all site cookies
   - Log out and log back in

---

## Getting Help

If you're still experiencing issues:

1. **Check logs**:
   - Vercel deployment logs
   - Browser console errors
   - Network tab in DevTools

2. **Review documentation**:
   - [Configuration Guide](./configuration.md)
   - [Installation Guide](./installation.md)
   - [Deployment Guide](./deployment.md)
   - [Tinybird Setup](./tinybird.md)

3. **Community support**:
   - GitHub Issues
   - GitHub Discussions

4. **Collect information**:
   - Error messages (full stack trace)
   - Environment (dev/production)
   - Steps to reproduce
   - Browser and version
   - Any recent changes
