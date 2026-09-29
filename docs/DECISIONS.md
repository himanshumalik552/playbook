# Architecture decisions

Short records of the decisions that shape the codebase. Each lists the context, the decision and its
consequences.

## 1. Read-only Google integration

**Context.** Automated changes to live advertising accounts carry financial risk and blur accountability.
**Decision.** Request only the `adwords` scope needed for reporting and never call a Google Ads mutate
endpoint. Negative keywords, bid and budget changes are recommendations or tracked actions carried out by a
person in Google Ads.
**Consequences.** Every action has an owner and an evaluation; ADPULSE cannot "apply" a recommendation, by
design.

## 2. Evidence-based recommendations, correlation not causation

**Decision.** Each recommendation stores the metrics, comparison window and thresholds that triggered it, and
its wording states what was observed ("CPA rose 38% while conversions fell") rather than a cause. Action
evaluations compare before/after windows and explicitly note that seasonality or other changes may contribute.
**Consequences.** Rules are deterministic and testable (`packages/core/src/recommendations/rules.ts`); no
opaque scoring.

## 3. Monorepo with shared contracts

**Decision.** pnpm workspaces + Turborepo. DTO types, Zod schemas and KPI formulas live in packages consumed by
both API and web, so a metric is calculated and labelled identically everywhere.
**Consequences.** Node apps consume compiled CommonJS packages; the web app aliases their TypeScript sources.
`pnpm deploy --prod` produces self-contained production bundles for the images.

## 4. Cookie sessions instead of tokens in browser storage

**Decision.** Short-lived access JWT and rotating refresh token in HttpOnly cookies (`SameSite=Lax` access,
`SameSite=Strict` refresh scoped to `/api/v1/auth`), double-submit CSRF token for state-changing requests.
Refresh-token reuse revokes the whole session family. The SPA and API share an origin through the proxy.
**Consequences.** Nothing sensitive is stored in `localStorage` (only UI preferences such as theme and the last
selected organization ID, which is re-validated server side on every request).

## 5. Organization context per request

**Decision.** The client sends `X-Organization-Id`; a guard resolves the membership and role for every request
and services receive an `OrgContext`. Every query filters on `organizationId`.
**Consequences.** Switching organizations needs no new token, and a user can hold different roles in
different organizations. Integration tests cover cross-tenant access.

## 6. PostgreSQL + Prisma, daily grain

**Decision.** Store Google data at daily grain per entity and segment, upserted idempotently. Totals for a range are
computed at query time from those tables rather than stored pre-aggregated per range.
**Consequences.** Any date range and comparison period can be answered consistently, re-syncing a window is
safe, and retention is a simple date cutoff.

## 7. BullMQ worker for all long-running work

**Decision.** Syncs, alert evaluation, recommendation generation, report rendering, email and cleanup run in
the worker; the API only enqueues. Job IDs are deterministic where duplicates would be harmful.
**Consequences.** API latency is independent of Google or Chromium; failures retry with backoff and land in a
dead-letter queue visible to super admins.

## 8. Mock integration mode as a first-class provider

**Decision.** `INTEGRATION_MODE=mock` swaps the Google providers for deterministic generators implementing the
same interfaces and flowing through the same sync pipeline.
**Consequences.** The full product, the seed and all automated tests run without credentials, and the real
provider code paths (mapping, upserts, alerts) are exercised by the same pipeline.

## 9. Server-rendered PDF with headless Chromium

**Decision.** Reports are HTML templates rendered to PDF by Puppeteer in the worker; Excel uses ExcelJS.
**Consequences.** Pixel-accurate, branded reports with charts; the worker image carries Chromium and needs a
larger `/dev/shm`.

## 10. Azure Container Apps as the reference cloud target

**Decision.** Container Apps + PostgreSQL Flexible Server + Azure Cache for Redis + Blob Storage + Key Vault,
described in Bicep, with a user-assigned identity for registry pulls and secret access.
**Consequences.** No secrets in templates or pipelines; the same images also run with Docker Compose on a single
host.

## 11. Dependency audit gate with a pinned transitive override

**Decision.** CI fails on high-severity advisories in production dependencies (`pnpm audit:deps`). Prisma 6
pulls a vulnerable `deepmerge-ts` 7.x through `@prisma/config`, so the root `pnpm.overrides` forces the
patched 8.x line.
**Consequences.** The Prisma CLI (validate, format, migrate, generate) is verified against the override; remove
it once Prisma ships a patched `@prisma/config` or when upgrading to Prisma 7.
