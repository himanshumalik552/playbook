# Architecture

## Components

```
            ┌──────────────┐   HTTPS    ┌────────────────────────────┐
 Browser ──▶│ web (nginx)  │──/api/*──▶ │ api (NestJS)               │
            │ SPA assets   │            │ auth · tenancy · REST      │
            └──────────────┘            └──────┬──────────────┬──────┘
                                               │ Prisma       │ BullMQ
                                        ┌──────▼─────┐  ┌─────▼─────┐
                                        │ PostgreSQL │  │   Redis   │
                                        └──────▲─────┘  └─────┬─────┘
                                               │              │
                                        ┌──────┴──────────────▼──────┐     Google Ads API
                                        │ worker (BullMQ processors) │───▶ GA4 Data/Admin API
                                        │ sync · alerts · reports …  │     SMTP · Blob storage
                                        └────────────────────────────┘
```

- **web** — React SPA. Talks only to `/api/v1` on its own origin, so authentication cookies are first-party
  and never readable by JavaScript. In production nginx serves the static build and proxies `/api`.
- **api** — NestJS. Owns authentication, tenancy, validation and all reads/writes. Long-running work is
  enqueued, never executed in the request.
- **worker** — BullMQ processors plus an hourly scheduling tick (a BullMQ job scheduler). Imports data from Google, aggregates
  metrics, evaluates alerts, generates recommendations, renders reports (Puppeteer for PDF, ExcelJS for
  XLSX), sends email and enforces data retention.
- **PostgreSQL** — system of record. **Redis** — job queues, rate-limit counters.

## Monorepo layout

| Package               | Responsibility                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@adpulse/config`     | Zod-validated environment (`loadEnv`), queue and job names                                                                                                                                 |
| `@adpulse/database`   | Prisma schema, migrations, client factory, `migrate.js` for production images                                                                                                              |
| `@adpulse/types`      | DTOs shared by API and web, enums, role → permission map                                                                                                                                   |
| `@adpulse/validation` | Zod schemas used by both API (DTO validation) and web (forms)                                                                                                                              |
| `@adpulse/kpi`        | Metric definitions, formulas (CTR, CPC, CPA, ROAS…), direction-of-good, safe division                                                                                                      |
| `@adpulse/core`       | Domain services used by API and worker: sync, metrics repository, alert rules, recommendation rules, targets, report data and renderers, providers (Google and mock), crypto, email, audit |
| `@adpulse/mock-data`  | Deterministic, seeded demo accounts and daily performance                                                                                                                                  |
| `@adpulse/ui`         | Shared MUI components (KPI cards, data table, states, page layout)                                                                                                                         |

The web app consumes `types`, `validation`, `kpi` and `ui` as TypeScript sources through Vite aliases;
Node apps consume their compiled CommonJS `dist` output.

## Multi-tenancy

- Every tenant-owned table carries `organizationId`, and every query filters on it.
- The active organization travels in the `X-Organization-Id` header. `OrgContextGuard` loads the caller's
  membership for that organization on every request and rejects the request (`403 NOT_A_MEMBER`) if there is
  none. The client-supplied ID is never trusted on its own.
- `PermissionsGuard` checks `@RequirePermissions(...)` against the membership role
  (`packages/types/src/permissions.ts`). Super admins use a separate `/admin` surface guarded by system role.
- Role changes and invitations cannot grant a role above the actor's own (`ORG_ROLE_RANK`).

## Data flow

1. **Connect** — OAuth (PKCE + state) against Google; refresh tokens are encrypted with AES-256-GCM before
   they are stored. In mock mode a demo connection is created instead.
2. **Sync** — the scheduler enqueues a daily sync per account at `SYNC_LOCAL_HOUR` in the organization's time
   zone (re-importing `SYNC_LOOKBACK_DAYS` to absorb conversion lag); a first import covers
   `INITIAL_SYNC_DAYS`. Rows are upserted idempotently per (entity, date, segment).
3. **Analyse** — after a sync, deduplicated jobs aggregate metrics, evaluate alert rules against baselines and
   targets, and generate recommendations with their supporting evidence.
4. **Act** — users triage alerts, approve recommendations, and track actions; action evaluation compares the
   monitored metric before and after the change without asserting causation.
5. **Report** — report requests are queued; the worker renders PDF/XLSX to local disk or Azure Blob Storage;
   scheduled templates are emailed at `REPORT_LOCAL_HOUR`.

## Dates, currency and time zones

- Metrics are stored per calendar day in the ad account's reporting time zone (as Google reports them) and
  exchanged as `YYYY-MM-DD` strings. "Today" and preset ranges are computed in the organization time zone.
- Money is stored in account currency; the UI formats with the organization currency and locale.

## Reliability

- Jobs use exponential backoff; exhausted jobs are moved to a dead-letter queue visible in `/admin`.
- Provider calls go through a shared HTTP helper with timeouts, retry on 429/5xx and structured
  `ProviderError`s; Google quota errors mark the sync job as retryable.
- `/api/v1/health/live` and `/health/ready` (database + Redis) back container health checks; the worker exposes
  the same on `WORKER_HEALTH_PORT`.
- Logs are structured JSON (pino) with a request ID; Application Insights or Sentry are enabled by setting
  their connection string / DSN.
