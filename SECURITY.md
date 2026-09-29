# Security

## Reporting a vulnerability

Please do not open a public issue. Email the maintainers at the security contact configured for your
deployment with a description, reproduction steps and impact. We aim to acknowledge reports within two
business days.

## Security model

### Authentication and sessions

- Passwords: Argon2id (`@node-rs/argon2`); minimum 12 characters with upper- and lower-case letters, a digit
  and a symbol. Failed logins are counted per account and lock it for `LOGIN_LOCKOUT_MINUTES` after
  `LOGIN_MAX_ATTEMPTS`; login errors do not reveal whether an email exists.
- Sessions: short-lived access JWT and a rotating refresh token, both in HttpOnly cookies. Refresh cookies are
  `SameSite=Strict` and scoped to `/api/v1/auth`. Presenting an already-rotated refresh token revokes the whole
  session family. Users can list and revoke sessions and sign out everywhere.
- CSRF: double-submit token (`adpulse_csrf` cookie + `X-CSRF-Token` header) on every state-changing request.
- No tokens or credentials are stored in `localStorage` or `sessionStorage`.
- Email verification, password reset and invitation tokens are random, stored only as hashes, single-use and
  time-limited.

### Authorization and tenancy

- Every organization-scoped request carries `X-Organization-Id`; the API verifies the caller's membership
  before any handler runs and never trusts the client-supplied ID alone.
- Role-based permissions are enforced server side on every endpoint (`@RequirePermissions`). The UI hides
  controls a role cannot use, but that is a convenience only.
- Invitations and role changes cannot grant a role above the actor's own; the last organization admin cannot be
  removed or demoted.
- Super-admin endpoints require the system role and are separate from organization roles.

### Secrets and data protection

- Google OAuth refresh tokens are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before storage; plain-text
  refresh tokens are never persisted or logged. Access tokens are not stored.
- OAuth uses PKCE and a signed, browser-bound `state` cookie with a 10-minute lifetime.
- In production the configuration validator rejects placeholder secrets, identical JWT secrets and missing
  integration credentials. No real credentials exist in the repository, seeds or examples; the documented demo
  passwords are for local development only.
- Logs are structured and pass through secret redaction; email bodies are not logged in production.
- Audit log entries record sign-ins, membership and role changes, integration changes, target and rule edits,
  and report generation.

### Integration safety

- ADPULSE never modifies Google Ads campaigns, budgets, bids, keywords or targeting, and never applies
  negative keywords automatically. Requested scopes are read-only in practice (`adwords` for reporting,
  `analytics.readonly`).

### Platform hardening

- Helmet security headers on the API; nginx adds CSP (`script-src 'self'`), HSTS, `X-Frame-Options: DENY`,
  `nosniff`, a strict referrer policy and a permissions policy.
- Input validation on every endpoint (class-validator DTOs and shared Zod schemas); request bodies limited to
  1 MB; rate limiting backed by Redis with stricter limits on authentication endpoints.
- No use of `eval` or dynamic code execution; post-login redirects accept same-origin relative paths only.
- Containers run as non-root with read-only root filesystems, dropped capabilities and `no-new-privileges` in
  the production Compose file; images contain production dependencies only.
- CI runs `pnpm audit` for high-severity advisories in production dependencies.

## Operator checklist

- [ ] `NODE_ENV=production`, unique secrets generated with `openssl rand`, `ENCRYPTION_KEY` backed up
- [ ] HTTPS everywhere, `COOKIE_SECURE=true`, `TRUST_PROXY=true` behind the proxy
- [ ] `SWAGGER_ENABLED=false`
- [ ] Demo seed not run, or demo accounts removed, on any reachable environment
- [ ] Database and storage not publicly reachable, or restricted by firewall / private networking
- [ ] Backups enabled and a restore tested ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
