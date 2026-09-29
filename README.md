# ADPULSE — Google Ads Performance Management Platform

ADPULSE is a multi-tenant SaaS application for marketing teams that manage Google Ads. It imports campaign
performance (and optionally GA4 landing-page engagement) **read-only**, compares it against targets, raises
evidence-based alerts and recommendations, tracks optimization actions from hypothesis to evaluation, and
produces client-ready PDF and Excel reports.

> ADPULSE never changes Google Ads campaigns, budgets, bids, keywords or targeting. Every change is made by a
> person in Google Ads; ADPULSE records the plan, the reasoning and the measured outcome.

## Features

| Area                | What it does                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview dashboard  | 10 KPIs with period comparison, trend and spend/value charts, top campaigns, alert/action/sync summaries                                                                            |
| Campaigns           | Explorer with sorting, filters and CSV export; campaign detail with 10 tabs (ad groups, keywords, search terms, devices, locations, landing pages, alerts, actions, change history) |
| Search terms        | Review queue with waste/opportunity classification; negative keywords are suggested, never applied                                                                                  |
| Alerts              | Rule-based detection (spend spikes, CPA/ROAS vs target, conversion drops, tracking gaps, budget-limited impression share…) with triage workflow                                     |
| Recommendations     | Evidence-based suggestions with the data that supports them; approve, dismiss or convert to an action                                                                               |
| Actions             | List and Kanban views, owners, comments, attachments, status workflow and before/after evaluation                                                                                   |
| Reports             | Templates, executive commentary, live preview, PDF/Excel generation, history and scheduled delivery                                                                                 |
| Targets & rules     | Organization, account and campaign targets; tunable alert-rule thresholds                                                                                                           |
| Integrations        | Google Ads and GA4 OAuth connections (PKCE), account/property selection, sync history                                                                                               |
| Team & organization | Invitations, roles (Admin, Marketing manager, Analyst, Viewer), organization settings, audit log                                                                                    |
| Profile             | Name, password, active sessions with remote sign-out                                                                                                                                |
| Super admin         | System health, organizations, users, feature flags, queues and failed jobs                                                                                                          |

## Architecture at a glance

```
apps/
  web/      React 18 + Vite + MUI + TanStack Query (SPA)
  api/      NestJS REST API (/api/v1, OpenAPI at /api/v1/docs)
  worker/   BullMQ worker: sync, alerts, recommendations, reports, email, cleanup, scheduler
packages/
  config/   Zod-validated environment      core/      domain services, providers, renderers
  database/ Prisma schema + client          kpi/       metric definitions and formulas
  types/    shared DTOs, enums, permissions validation/ shared Zod schemas (web + api)
  ui/       shared MUI components           mock-data/ deterministic demo data source
  eslint-config, tsconfig                   shared tooling presets
infrastructure/
  nginx/    SPA + /api reverse proxy config  azure/     Bicep for Azure Container Apps
```

PostgreSQL stores all tenant data (every row is scoped by `organizationId`); Redis backs the job queues and
rate limiting. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Prerequisites

- Node.js 22 (see `.nvmrc`) and pnpm 9 (`corepack enable`)
- Docker (for PostgreSQL 16 and Redis 7), or your own PostgreSQL/Redis instances

## Local development

```bash
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Service            | URL                                |
| ------------------ | ---------------------------------- |
| Web app            | http://localhost:5173              |
| API                | http://localhost:3000/api/v1       |
| API docs (Swagger) | http://localhost:3000/api/v1/docs  |
| Worker health      | http://localhost:3001/health/ready |

`INTEGRATION_MODE=mock` (the default) serves deterministic demo data, so the whole product works without any
Google credentials. If port 3000 is taken, set `API_PORT` and `VITE_API_PROXY_TARGET` together in `.env`.

To run the complete stack in containers instead: `docker compose --profile app up --build` → http://localhost:8080.

### Demo credentials — development only

`pnpm db:seed` creates these accounts **for local development and demos only**. The seed refuses to run in
production without explicit `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD`, and these passwords must never be
used on a reachable environment.

| Email                    | Password              | Access                                                                 |
| ------------------------ | --------------------- | ---------------------------------------------------------------------- |
| `admin@adpulse.local`    | `AdPulse-Admin-2026!` | Platform super admin (`/admin`)                                        |
| `admin@northwind.demo`   | `AdPulse-Demo-2026!`  | Northwind Outdoor Group — Organization admin; Fabrikam Retail — Viewer |
| `manager@northwind.demo` | `AdPulse-Demo-2026!`  | Northwind — Marketing manager                                          |
| `analyst@northwind.demo` | `AdPulse-Demo-2026!`  | Northwind — Analyst                                                    |
| `viewer@northwind.demo`  | `AdPulse-Demo-2026!`  | Northwind — Viewer                                                     |
| `owner@fabrikam.demo`    | `AdPulse-Demo-2026!`  | Fabrikam Retail — Organization admin (no data source connected)        |

Northwind (USD, America/New_York) has two mock Google Ads accounts with ~180 days of history, alerts,
recommendations, actions and report templates. Fabrikam (EUR, Europe/Berlin) is empty, which shows the
onboarding and empty states.

## Scripts

| Command                                   | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                | API, worker and web in watch mode                               |
| `pnpm build`                              | Build every package and app                                     |
| `pnpm lint` / `pnpm typecheck`            | ESLint and TypeScript across the monorepo                       |
| `pnpm test`                               | Unit tests (Jest for the API, Vitest elsewhere)                 |
| `pnpm test:integration`                   | API integration tests against PostgreSQL and Redis              |
| `pnpm test:e2e`                           | Playwright end-to-end tests (needs a migrated, seeded database) |
| `pnpm db:migrate` / `pnpm db:migrate:dev` | Apply migrations / create a new migration                       |
| `pnpm db:seed` / `pnpm db:reset`          | Seed demo data / drop, migrate and reseed                       |
| `pnpm db:validate`                        | `prisma validate` and `prisma format --check`                   |
| `pnpm format` / `pnpm format:check`       | Prettier                                                        |

### End-to-end tests

```bash
pnpm --filter @adpulse/web exec playwright install chromium   # once
pnpm test:e2e
```

Playwright reuses running dev servers or starts the built API and the Vite dev server itself. Set
`E2E_API_PORT` if the API does not listen on 3000, or `E2E_BASE_URL` to test an already deployed instance.

## Connecting real Google accounts

Set `INTEGRATION_MODE=google` and provide:

| Variable                                   | Where it comes from                                                  |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client (Web application)                |
| `GOOGLE_OAUTH_REDIRECT_URI`                | `<API_URL>/api/v1/auth/google/callback` (Google sign-in)             |
| `GOOGLE_INTEGRATION_REDIRECT_URI`          | `<API_URL>/api/v1/integrations/google/callback` (Ads/GA4 connection) |
| `GOOGLE_ADS_DEVELOPER_TOKEN`               | Google Ads API Center (manager account)                              |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID`             | Optional manager (MCC) customer ID without dashes                    |
| `GOOGLE_ADS_API_VERSION`                   | Defaults to `v21`                                                    |

Step-by-step instructions: [docs/GOOGLE_INTEGRATION.md](docs/GOOGLE_INTEGRATION.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Google integration](docs/GOOGLE_INTEGRATION.md)
- [Deployment, migrations, backup and restore](docs/DEPLOYMENT.md) · [Decisions](docs/DECISIONS.md)
- [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)
