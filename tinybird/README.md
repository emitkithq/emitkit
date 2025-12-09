# Tinybird Configuration

This directory contains Tinybird data sources and pipes for event storage.

## Documentation

See [docs/tinybird.md](../docs/tinybird.md) for complete setup and usage guide.

## CLI Quick Reference

```bash
# Authenticate
pnpm exec tb login

# Deploy to Tinybird
pnpm exec tb deploy

# Test a pipe
pnpm exec tb pipe test PIPE_NAME --param key=value

# Check status
pnpm exec tb datasource ls
pnpm exec tb pipe ls

# Query data directly
pnpm exec tb datasource query events "SELECT count() FROM events"
```

## Directory Structure

- `datasources/` - Event data source definitions
- `pipes/` - Query pipes for analytics and streaming
- `.tinyb` - Authentication credentials (gitignored)

## Resources

- [Full Tinybird Setup Guide](../docs/tinybird.md)
- [Tinybird Documentation](https://www.tinybird.co/docs/forward)
- [Tinybird CLI Reference](https://www.tinybird.co/docs/forward/dev-reference/commands)
