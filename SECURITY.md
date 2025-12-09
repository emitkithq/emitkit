# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of EmitKit seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please do not:

- Open a public GitHub issue
- Disclose the vulnerability publicly before it has been addressed

### Please do:

1. **Email us directly** at [INSERT SECURITY EMAIL]
   - Include detailed steps to reproduce the vulnerability
   - Include your GitHub username if you'd like to be credited
   - Include any proof-of-concept code if applicable

2. **What to expect**:
   - We will acknowledge receipt of your vulnerability report within 48 hours
   - We will send a more detailed response within 7 days indicating the next steps
   - We will work with you to understand and resolve the issue
   - We will keep you informed of the progress toward resolution

3. **Disclosure Policy**:
   - We will publicly disclose the vulnerability once a fix is released
   - You will be credited in the security advisory (unless you prefer to remain anonymous)
   - We ask that you wait for our fix before publicly disclosing the vulnerability

## Security Update Process

When we receive a security vulnerability report:

1. We confirm the vulnerability and determine affected versions
2. We audit code to find similar potential problems
3. We prepare fixes for all supported versions
4. We release new versions with security patches
5. We publish a security advisory on GitHub

## Security Best Practices

When deploying EmitKit in production:

### Environment Variables

- **Never commit** `.env` files to version control
- **Use strong secrets** for `BETTER_AUTH_SECRET`
- **Rotate credentials** regularly
- **Use environment-specific** API keys (dev/staging/prod)

### Database

- **Use strong passwords** for database access
- **Enable SSL/TLS** for database connections in production
- **Restrict network access** to database (firewall rules)
- **Regularly backup** your database

### API Keys

- **Rotate API keys** if compromised
- **Use HTTPS only** for API requests
- **Implement rate limiting** (built-in with Better Auth API keys)
- **Monitor API usage** for suspicious activity

### Webhooks

- **Validate webhook signatures** using HMAC
- **Use HTTPS endpoints only** for webhooks
- **Whitelist IPs** if possible
- **Monitor failed webhook attempts**

### Push Notifications

- **Keep VAPID keys secret**
- **Store keys** in environment variables, not code
- **Regenerate keys** if compromised

### General

- **Keep dependencies updated**: Run `pnpm update` regularly
- **Review security advisories**: Monitor GitHub Dependabot alerts
- **Use HTTPS**: Always use HTTPS in production
- **Enable CORS properly**: Configure CORS to allow only trusted origins
- **Audit logs**: Review application logs regularly

## Known Security Considerations

### Input Validation

- All user inputs are validated using Zod schemas
- SQL injection is prevented by using Drizzle ORM parameterized queries
- XSS protection is provided by Svelte's automatic escaping

### Authentication

- Session management handled by Better Auth
- CSRF protection enabled by default in SvelteKit
- Password hashing uses industry-standard algorithms (Better Auth)

### Data Privacy

- User passwords are never stored in plaintext
- Sensitive data is encrypted at rest (database encryption)
- API keys are hashed before storage

## Third-Party Dependencies

We rely on several third-party services:

- **Better Auth**: Authentication and session management
- **Tinybird**: Event analytics storage
- **PostgreSQL**: Primary database
- **Redis**: Caching (optional)

Please review their security policies:

- [Better Auth Security](https://www.better-auth.com/docs/security)
- [Tinybird Security](https://www.tinybird.co/security)

## Security Contact

For security-related questions or concerns, email: [INSERT SECURITY EMAIL]

For general questions, use [GitHub Discussions](https://github.com/yourusername/blip-sk/discussions).
