# Tinybird Setup Guide

Tinybird provides scalable event storage and real-time analytics for EmitKit using ClickHouse.

## Prerequisites

- Tinybird account ([sign up](https://ui.tinybird.co))
- Tinybird CLI installed (included in project dependencies)
- EmitKit project cloned locally

## Installation

### 1. Verify CLI Installation

The Tinybird CLI is already installed as a dev dependency:

```bash
pnpm exec tb --version
```

### 2. Authenticate

Login to Tinybird:

```bash
pnpm exec tb login
```

This will open a browser for authentication and store credentials in `.tinyb` (gitignored).

### 3. Get API Token

1. Visit [Tinybird Console](https://ui.tinybird.co/tokens)
2. Create a new token with admin permissions
3. Copy the token

### 4. Configure Environment

Add to `.env`:

```bash
TINYBIRD_TOKEN="your-token-from-console"
TINYBIRD_API_URL="https://api.tinybird.co"
```

See [Configuration Guide](./configuration.md) for more details.

---

## Deployment

### Deploy All Resources

Deploy data sources and pipes to Tinybird:

```bash
cd tinybird
pnpm exec tb deploy
```

This creates:

- **events** data source (main events table)
- **stream_events.pipe** - Real-time event streaming
- **get_events_paginated.pipe** - Paginated event list
- **get_events_stats.pipe** - Dashboard statistics
- **events_hourly_mv.pipe** - Hourly aggregations
- **events_daily_mv.pipe** - Daily aggregations

### Verify Deployment

Check that resources were created:

```bash
pnpm exec tb datasource ls
pnpm exec tb pipe ls
```

---

## Project Structure

```
tinybird/
├── datasources/          # Data source definitions
│   └── events.datasource      # Main events table
├── pipes/                # Query pipes (API endpoints)
│   ├── stream_events.pipe           # Real-time streaming
│   ├── get_events_paginated.pipe    # Paginated list
│   └── get_events_stats.pipe        # Statistics
└── .tinyb                # Auth credentials (gitignored)
```

---

## Data Sources

### events.datasource

Main events table storing all application events.

**Features:**

- **Sorting key**: `organization_id, retention_tier, site_id, channel_id, created_at`
- **Partitioning**: Monthly (`toYYYYMM(created_at)`)
- **TTL**: 400 days (buffer beyond max retention)
- **Engine**: MergeTree (optimized for time-series data)

**Schema includes:**

- `organization_id` - Organization identifier
- `site_id` - Site identifier
- `channel_id` - Channel identifier
- `retention_tier` - Retention policy (basic, premium, unlimited)
- `title`, `description`, `tags`, `metadata` - Event data
- `created_at` - Event timestamp

---

## Retention Policies

Events are automatically filtered based on organization's retention tier at query time:

### Retention Tiers

- **Basic**: 90 days
- **Premium**: 365 days
- **Unlimited**: No limit

### How It Works

1. When an event is created, the organization's retention tier is captured
2. Events are stored with their tier (snapshot at creation time)
3. Queries automatically filter events based on their tier
4. No manual cleanup needed - TTL handles old events

### Example

```typescript
// Event created on Basic plan (90-day retention)
Event A created on Day 0

// Organization upgrades to Premium on Day 60
Event B created on Day 61 (365-day retention)

// Query on Day 150:
// - Event A: Not visible (created 150 days ago, basic tier = 90 days)
// - Event B: Visible (created 89 days ago, premium tier = 365 days)
```

This is intentional - users gain longer retention going forward, but old events follow their original plan.

---

## API Endpoints

All pipes are exposed as REST API endpoints at:
`https://api.tinybird.co/v0/pipes/{pipe_name}.{format}`

### stream_events.pipe

Real-time event streaming for live dashboards.

- **Parameters**: `channel_id`, `organization_id`, `since` (timestamp)
- **Usage**: Polling endpoint for SSE
- **Update frequency**: Clients poll every 3 seconds

### get_events_paginated.pipe

Paginated event list with filtering.

- **Parameters**: `channel_id`, `organization_id`, `limit`, `offset`, `date_from`, `date_to`
- **Usage**: Historical event browsing

### get_events_stats.pipe

Aggregated statistics for dashboards.

- **Parameters**: `organization_id`, `channel_id` (optional), `date_from`, `date_to`
- **Returns**: Event counts, unique users, tag distributions

---

## Development Workflow

### Testing Pipes Locally

Test a pipe with parameters:

```bash
pnpm exec tb pipe test stream_events \
  --param organization_id=org_123 \
  --param channel_id=ch_456 \
  --param since="2024-01-01 00:00:00"
```

### Monitoring

View real-time stats:

```bash
pnpm exec tb pipe stats stream_events
```

Or visit [Tinybird Console](https://ui.tinybird.co) for UI monitoring.

### Updating Resources

After modifying data sources or pipes:

```bash
pnpm exec tb deploy
```

Or deploy specific resources:

```bash
pnpm exec tb deploy datasources/events.datasource
pnpm exec tb deploy pipes/stream_events.pipe
```

---

## CI/CD Integration

### GitHub Actions

Add to your deployment pipeline:

```yaml
- name: Deploy Tinybird
  run: pnpm exec tb deploy --force
  env:
    TB_TOKEN: ${{ secrets.TINYBIRD_TOKEN }}
```

### Vercel

Tinybird deployment is separate from Vercel. Deploy Tinybird resources manually or via CI/CD before deploying to Vercel.

---

## Troubleshooting

### Authentication Failed

**Error**: `Authentication failed`

**Solutions**:

1. Verify `TINYBIRD_TOKEN` is correct
2. Check token has admin permissions
3. Try re-running `pnpm exec tb login`
4. Regenerate token in Tinybird Console

### Deployment Failed

**Error**: `Deployment failed` or schema errors

**Solutions**:

1. Check syntax in `.datasource` and `.pipe` files
2. Verify all required fields are present
3. Run `pnpm exec tb deploy --force` to override
4. Check Tinybird Console for error details

### No Events Showing

**Error**: Queries return no results

**Solutions**:

1. Verify events are being ingested: `pnpm exec tb datasource query events "SELECT count() FROM events"`
2. Check retention tier filtering in pipes
3. Verify `organization_id` and `channel_id` parameters are correct
4. Check date range parameters

### Slow Queries

**Error**: Queries taking too long

**Solutions**:

1. Verify indexes on `organization_id`, `channel_id`, `created_at`
2. Check sorting key matches your query patterns
3. Use materialized views for common aggregations
4. Consider partitioning optimization

---

## Data Management

### Truncate Data Source (Careful!)

Delete all data from a datasource:

```bash
pnpm exec tb datasource truncate events --yes
```

**Warning**: This is irreversible! Only use in development.

### Query Data Source Directly

Run SQL queries:

```bash
pnpm exec tb datasource query events "SELECT count() FROM events WHERE organization_id = 'org_123'"
```

---

## Best Practices

### 1. Use Retention Tiers

- Set appropriate retention tier for each organization based on their plan
- Let query-time filtering handle retention automatically
- No manual cleanup needed

### 2. Monitor Usage

- Check Tinybird Console for API usage
- Set up alerts for high query volumes
- Monitor data source size

### 3. Optimize Queries

- Use indexes effectively (organization_id, channel_id, created_at)
- Filter by organization first to leverage sorting key
- Use materialized views for common aggregations

### 4. Version Control

- Keep all `.datasource` and `.pipe` files in Git
- Document changes in commit messages
- Test changes in staging before production

### 5. Security

- Never commit `.tinyb` to Git
- Use separate tokens for development and production
- Rotate tokens regularly
- Use minimum required permissions

---

## Resources

- [Tinybird Documentation](https://www.tinybird.co/docs/forward)
- [Tinybird CLI Reference](https://www.tinybird.co/docs/forward/dev-reference/commands)
- [Events API](https://www.tinybird.co/docs/forward/get-data-in/events-api)
- [ClickHouse SQL Reference](https://clickhouse.com/docs/en/sql-reference/)

---

## Next Steps

- [Configuration Guide](./configuration.md) - Environment variables
- [Deployment Guide](./deployment.md) - Deploy to production
- [Troubleshooting](./troubleshooting.md) - Common issues
