# API

Base path: `/api/v1`. The OpenAPI document is served at `/api/v1/docs` (Swagger UI) and
`/api/v1/docs/openapi.json` when `SWAGGER_ENABLED=true` (disable it in production).

## Conventions

| Topic          | Rule                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Envelope       | Success: `{ "success": true, "data": …, "meta"?: { page, pageSize, total, totalPages }, "requestId" }`. Error: `{ "success": false, "error": { "code", "message", "details"? }, "requestId" }`                                                                                       |
| Authentication | HttpOnly cookies set by `/auth/login`, `/auth/register` and `/auth/refresh`. The access token is short-lived (`JWT_ACCESS_TTL_SECONDS`); the refresh cookie is scoped to `/api/v1/auth` and rotated on every use.                                                                    |
| CSRF           | Double-submit: state-changing requests must send `X-CSRF-Token` equal to the `adpulse_csrf` cookie (`GET /auth/csrf` issues one).                                                                                                                                                    |
| Tenancy        | Organization-scoped endpoints require `X-Organization-Id`; membership is verified on every request.                                                                                                                                                                                  |
| Pagination     | `page` (1-based), `pageSize` (1–200, default 25), `sortBy`, `sortDir=asc\|desc`, `search`.                                                                                                                                                                                           |
| Dates          | `from` / `to` as `YYYY-MM-DD`, inclusive, at most 731 days, interpreted in the organization time zone.                                                                                                                                                                               |
| Metric filters | `adAccountId`, `campaignIds` (comma-separated), `device`, `locationId`, `objective`, `compare=true\|false`.                                                                                                                                                                          |
| Rate limits    | Global `RATE_LIMIT_MAX` per `RATE_LIMIT_TTL_SECONDS` per client, stored in Redis; auth endpoints are stricter (e.g. 10 logins per minute). Exceeding a limit returns `429 RATE_LIMITED`.                                                                                             |
| Errors         | `400 VALIDATION_FAILED` (request shape), `401 UNAUTHENTICATED`, `403 INSUFFICIENT_PERMISSIONS / NOT_A_MEMBER / CSRF_INVALID`, `404 NOT_FOUND`, `409 CONFLICT / INVALID_STATE`, `422 VALIDATION_FAILED` (domain rules), `423 LOCKED` (account lockout), `502/503` integration errors. |

## Endpoints

Permissions refer to `packages/types/src/permissions.ts`; every organization role includes `analytics:read`.

### Auth and profile (no organization header)

| Method       | Path                                                                                 | Notes                                                           |
| ------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| GET          | `/auth/csrf`                                                                         | Issues the CSRF cookie                                          |
| POST         | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` | Session lifecycle                                               |
| POST         | `/auth/forgot-password`, `/auth/reset-password`                                      | `forgot-password` answers `202` whether or not the email exists |
| POST         | `/auth/verify-email`, `/auth/resend-verification`                                    | Email verification                                              |
| GET          | `/auth/google`, `/auth/google/callback`                                              | Google sign-in (when configured)                                |
| GET / PATCH  | `/users/me`                                                                          | Current user, memberships, feature flags                        |
| POST         | `/users/me/password`                                                                 | `{ currentPassword?, newPassword }`                             |
| GET / DELETE | `/users/me/sessions`, `/users/me/sessions/:id`                                       | Active sessions                                                 |
| GET / POST   | `/organizations`                                                                     | List own organizations / create one (caller becomes admin)      |
| POST         | `/invitations/preview`, `/invitations/accept`                                        | Invitation token flow                                           |

### Organization

| Method               | Path                                   | Permission                               |
| -------------------- | -------------------------------------- | ---------------------------------------- |
| GET / PATCH          | `/organizations/current`               | `analytics:read` / `organization:manage` |
| POST                 | `/organizations/current/onboarding`    | `organization:manage`                    |
| GET / PATCH / DELETE | `/memberships`, `/memberships/:id`     | `analytics:read` / `members:manage`      |
| GET / POST / DELETE  | `/invitations`, `/invitations/:id`     | `members:manage`                         |
| GET                  | `/audit-logs` (`search`, `from`, `to`) | `audit:read`                             |

### Performance (`analytics:read`)

| Method | Path                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard/overview`, `/dashboard/summary`, `/dashboard/filters`, `/dashboard/breakdown/:dimension`                       |
| GET    | `/campaigns`, `/campaigns/export` (CSV), `/campaigns/:id`, `/campaigns/:id/breakdown/:dimension`, `/campaigns/:id/changes` |
| GET    | `/ad-groups`, `/keywords`, `/search-terms`, `/landing-pages`                                                               |
| PATCH  | `/search-terms/:id/review` (`search-terms:review`) — records a decision; nothing is pushed to Google Ads                   |

### Alerts, recommendations, actions

| Method             | Path                                                               | Permission                                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------- |
| GET                | `/alerts`, `/alerts/:id`                                           | `analytics:read`                                         |
| PATCH              | `/alerts/:id`                                                      | `alerts:update`                                          |
| POST               | `/alerts/bulk`                                                     | `alerts:update` and `alerts:bulk`                        |
| POST               | `/alerts/evaluate`                                                 | `sync:trigger`                                           |
| GET / PATCH / POST | `/alert-rules`, `/alert-rules/:id`, `/alert-rules/:id/reset`       | `analytics:read` / `alert-rules:manage`                  |
| GET                | `/recommendations`, `/recommendations/:id`                         | `analytics:read`                                         |
| POST               | `/recommendations`                                                 | `recommendations:create`                                 |
| POST               | `/recommendations/generate`                                        | `sync:trigger`                                           |
| POST               | `/recommendations/:id/approve`, `/recommendations/:id/dismiss`     | `recommendations:decide`                                 |
| POST               | `/recommendations/:id/convert`                                     | `recommendations:decide` and `actions:create`            |
| GET                | `/actions`, `/actions/board`, `/actions/:id`                       | `analytics:read`                                         |
| POST               | `/actions`                                                         | `actions:create`                                         |
| PATCH / POST       | `/actions/:id`, `/actions/:id/transition`, `/actions/:id/comments` | `actions:update` (`actions:assign` to set another owner) |
| DELETE             | `/actions/:id`                                                     | `actions:assign`                                         |

### Targets and reports

| Method                      | Path                                                                                         | Permission                                               |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GET                         | `/targets`, `/targets/history`                                                               | `analytics:read`                                         |
| PUT / DELETE                | `/targets`, `/targets/:id`                                                                   | `targets:manage`                                         |
| GET                         | `/reports`, `/reports/:id`, `/reports/:id/download`, `/reports/sections`, `/reports/preview` | `reports:read`                                           |
| POST                        | `/reports`, `/reports/:id/retry`                                                             | `reports:generate` (`reports:commentary` for commentary) |
| GET / POST / PATCH / DELETE | `/reports/templates`, `/reports/templates/:id`                                               | `reports:read` / `reports:schedule`                      |

### Integrations and sync

| Method      | Path                                                         | Permission                                                         |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| GET         | `/integrations`                                              | `analytics:read`                                                   |
| POST        | `/integrations/google/connect`                               | `integrations:manage` — returns the Google consent URL             |
| GET         | `/integrations/google/callback`                              | OAuth redirect target (state-bound)                                |
| POST        | `/integrations/demo`                                         | `integrations:manage`, mock mode only                              |
| GET / PUT   | `/integrations/:id/accounts`, `/integrations/:id/properties` | `integrations:manage`                                              |
| DELETE      | `/integrations/:id`                                          | `integrations:manage` — revokes the token at Google and deletes it |
| GET / PATCH | `/ad-accounts`, `/ad-accounts/:id`                           | `analytics:read` / `integrations:manage`                           |
| GET         | `/sync/jobs`, `/sync/jobs/:id`                               | `analytics:read`                                                   |
| POST        | `/sync`                                                      | `sync:trigger`                                                     |

### Platform administration (super admin)

`/admin/health`, `/admin/organizations`, `/admin/users`, `/admin/users/:id/unlock`, `/admin/feature-flags`,
`/admin/feature-flags/:key`, `/admin/queues`, `/admin/failed-jobs`, `/admin/failed-jobs/:id/retry`,
`/admin/failed-jobs/:id` (DELETE), `/admin/sync-failures`.

### Health (public, not rate limited)

`/health/live` (process up), `/health/ready` (database and Redis reachable), `/health` (both plus version).
