# Contributing

## Setup

Follow "Local development" in the [README](README.md). Use Node 22 and pnpm 9 (`corepack enable`).

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`).
2. Keep changes focused; include tests for behaviour changes.
3. Before pushing, run what CI runs:

   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
   pnpm db:validate
   pnpm test:integration   # needs PostgreSQL and Redis
   pnpm test:e2e           # needs a migrated and seeded database
   ```

4. Open a pull request describing the change, how it was tested, and any migration or configuration impact.

## Conventions

- **TypeScript strict** everywhere; no `any`, no disabled lint rules as shortcuts, no `eval`.
- **Shared contracts first.** New endpoints add DTO types to `@adpulse/types` and, where the web app submits
  data, a Zod schema to `@adpulse/validation` used by both sides.
- **Tenancy.** Organization-scoped endpoints use the org guard and `@RequirePermissions`; every query filters on
  `organizationId`. Add an integration test when you add a new tenant-scoped resource.
- **Metrics.** Define formulas once in `@adpulse/kpi`; never recompute ratios ad hoc in the UI.
- **Google Ads is read-only.** Do not add code that mutates advertising accounts.
- **Recommendations and alerts** must carry the evidence that triggered them and describe correlation, not
  causation.
- **UI.** Use the shared components in `@adpulse/ui` and the MUI theme; every data view handles loading,
  empty, error and permission states; destructive actions use a confirmation dialog.
- **Comments** explain _why_, not _what_. Remove dead code, debug output and TODOs before review.

## Database changes

```bash
# edit packages/database/prisma/schema.prisma
pnpm db:migrate:dev -- --name <short_description>
pnpm db:validate
```

Commit the generated migration. Follow the expand/contract approach in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) so every migration is backward compatible with the previous release.

## Commit messages

Conventional Commits (`feat(api): add alert snooze`, `fix(web): keep filters on org switch`).
