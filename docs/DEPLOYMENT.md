# Deployment

ADPULSE ships as three images built from the repository root:

| Image    | Dockerfile                    | Listens            | Health                                        |
| -------- | ----------------------------- | ------------------ | --------------------------------------------- |
| `api`    | `apps/api/Dockerfile`         | 3000               | `/api/v1/health/live`, `/api/v1/health/ready` |
| `worker` | `apps/worker/Dockerfile`      | 3001 (health only) | `/health/live`, `/health/ready`               |
| `web`    | `apps/web/Dockerfile` (nginx) | 8080               | `/healthz`                                    |

All images are multi-stage (build with the full workspace, run with `pnpm deploy --prod` output or static
files only), run as non-root users (`node`, uid 1000; nginx uid 101), use `tini` as PID 1 for Node, and
define a `HEALTHCHECK`. The worker image includes Debian's Chromium for PDF rendering.

```bash
docker build -f apps/api/Dockerfile    -t <registry>/adpulse/api:<tag> .
docker build -f apps/worker/Dockerfile -t <registry>/adpulse/worker:<tag> .
docker build -f apps/web/Dockerfile    -t <registry>/adpulse/web:<tag> .
```

## Production configuration

Start from `.env.example`. Mandatory changes for production:

- `NODE_ENV=production` — enables strict validation: the API and worker refuse to start with the development
  placeholder secrets, identical JWT secrets, or incomplete Google/SMTP/Azure settings.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — `openssl rand -base64 48`, different values.
- `ENCRYPTION_KEY` — `openssl rand -base64 32`. **Back it up**: without it the stored Google refresh tokens
  cannot be decrypted and every connection must be re-authorized. Changing it has the same effect.
- `WEB_URL` and `API_URL` — the public origin (the web container proxies `/api`, so both are usually equal).
- `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `SWAGGER_ENABLED=false`.
- `STORAGE_PROVIDER=azure` with `AZURE_STORAGE_CONNECTION_STRING`, or a persistent volume for `LOCAL_STORAGE_PATH`
  shared by api and worker.
- `EMAIL_PROVIDER=smtp` with the `SMTP_*` settings.
- Google settings as described in [GOOGLE_INTEGRATION.md](GOOGLE_INTEGRATION.md).

## Option A — single host with Docker Compose

```bash
cp .env.example .env.production        # edit as above; also set POSTGRES_*, REDIS_PASSWORD
# DATABASE_URL=postgresql://<user>:<password>@postgres:5432/adpulse?schema=public
# REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

The stack runs a one-shot `migrate` service before `api` and `worker` start. Containers have read-only root
filesystems, drop all Linux capabilities and set `no-new-privileges`; only `web` publishes a port. Put a TLS
terminating proxy (Caddy, Traefik, a cloud load balancer) in front of port 8080.

## Option B — Azure Container Apps (Bicep)

`infrastructure/azure/main.bicep` provisions: Log Analytics and Application Insights, Azure Container Registry,
a user-assigned managed identity (AcrPull, Key Vault Secrets User), Key Vault holding every secret, PostgreSQL
Flexible Server 16, Azure Cache for Redis (TLS only), a StorageV2 account with a private `reports` container,
a Container Apps environment with `api` (internal ingress), `worker` (no ingress), `web` (external ingress) and
a manual `migrate` job.

```bash
az group create -n adpulse-prod -l westeurope

# Secrets are read from the environment by main.bicepparam; nothing secret is written to disk.
export ADPULSE_PG_PASSWORD=... ADPULSE_JWT_ACCESS_SECRET=... ADPULSE_JWT_REFRESH_SECRET=... ADPULSE_ENCRYPTION_KEY=...
export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_ADS_DEVELOPER_TOKEN=... SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=...

# 1. First deployment only: create the registry and data services, without the apps.
az deployment group create -g adpulse-prod -f infrastructure/azure/main.bicep \
  -p infrastructure/azure/main.bicepparam -p deployApps=false

# 2. Build and push images (CI does this on every release).
ACR=$(az deployment group show -g adpulse-prod -n main --query properties.outputs.registryLoginServer.value -o tsv)
az acr login -n "${ACR%%.*}"
export IMAGE_TAG=$(git rev-parse --short HEAD)
for app in api worker web; do
  docker build -f apps/$app/Dockerfile -t $ACR/adpulse/$app:$IMAGE_TAG . && docker push $ACR/adpulse/$app:$IMAGE_TAG
done

# 3. Deploy the apps, then run migrations.
az deployment group create -g adpulse-prod -f infrastructure/azure/main.bicep -p infrastructure/azure/main.bicepparam
az containerapp job start -g adpulse-prod -n adpulse-prod-migrate
```

Register `<publicUrl>/api/v1/auth/google/callback` and `<publicUrl>/api/v1/integrations/google/callback` in the
Google OAuth client (`publicUrl` is a deployment output). For a custom domain, set `customDomain`, bind the
certificate to the `web` container app, and redeploy so the redirect URIs and `WEB_URL` follow.

Role assignments can take a few minutes to propagate; if the first app deployment fails to read Key Vault,
rerun the same command.

## Releases, migrations and rollback

Release order: **build images → run migrations → roll out api and worker → roll out web**.

- Migrations are applied with `prisma migrate deploy` (`node node_modules/@adpulse/database/dist/migrate.js` in
  the api image, the `migrate` Compose service, or the Azure `migrate` job). It only applies committed
  migrations from `packages/database/prisma/migrations` and never generates SQL at deploy time.
- Write migrations **expand/contract**: add columns/tables in one release, switch code, remove old structures in
  a later release. The previous application version then keeps working against the new schema, so an
  application rollback is only an image change:
  - Compose: `IMAGE_TAG=<previous> docker compose -f docker-compose.production.yml --env-file .env.production up -d api worker web`
  - Azure: redeploy with the previous `IMAGE_TAG`, or activate the previous revision in the Container App.
- Prisma does not generate down migrations. To undo a schema change, ship a new forward migration. If a
  migration fails halfway, fix the cause, then mark it with
  `pnpm --filter @adpulse/database exec prisma migrate resolve --rolled-back <migration_name>` (or
  `--applied` if you completed it manually) and deploy again.
- For destructive migrations, take an on-demand backup first (below) so a point-in-time restore is available.

Check state at any time with `pnpm db:migrate:status` (locally) or by running
`prisma migrate status --schema node_modules/@adpulse/database/prisma/schema.prisma` inside the api image.

## Backup and restore

| Data         | Where                                              | Backup                                                                                                                                                           |
| ------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL   | All tenant data                                    | Azure: automated backups with point-in-time restore (`postgresBackupRetentionDays`, default 14; enable geo-redundant backup for DR). Compose: `pg_dump` (below). |
| Report files | Blob container `reports` / `report-storage` volume | Blob soft delete (14 days). Reports can also be regenerated from the database.                                                                                   |
| Redis        | Queues and rate-limit counters                     | Not backed up; transient. Scheduled jobs are recreated by the scheduler.                                                                                         |
| Secrets      | Key Vault / `.env.production`                      | Key Vault soft delete and purge protection; store `.env.production` in a secrets manager.                                                                        |

**Azure — point-in-time restore** (creates a new server; the original stays untouched):

```bash
az postgres flexible-server restore -g adpulse-prod \
  --name adpulse-prod-pg-restored --source-server <postgresServerName> \
  --restore-time "2026-09-28T08:00:00Z"
```

Verify the restored data, then update the `database-url` secret in Key Vault to point at the restored server and
restart the api and worker revisions.

**Compose — logical backup and restore:**

```bash
# Backup (run daily from cron; copy the file off the host)
docker compose -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d adpulse -Fc > adpulse-$(date +%F).dump

# Restore into an empty database
docker compose -f docker-compose.production.yml stop api worker
docker compose -f docker-compose.production.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d adpulse --clean --if-exists --no-owner < adpulse-2026-09-28.dump
docker compose -f docker-compose.production.yml up -d api worker
```

Test restores regularly: restore into a scratch database, run `prisma migrate status`, and sign in.

## Operations checklist

- Dashboards: Application Insights (requests, failures, dependencies) or Sentry; Container Apps log stream.
- `/admin` (super admin) shows queue depth, failed jobs with retry, sync failures and feature flags.
- Scale the API horizontally. Worker replicas can be added when queue latency grows: the hourly scheduling tick
  and the nightly cleanup are BullMQ job schedulers stored in Redis, so they run once regardless of the number
  of replicas.
- Data retention: the nightly cleanup deletes daily metrics older than each organization's `dataRetentionDays`,
  old generated reports, and expired sessions, verification/reset tokens and invitations.
- Rotate JWT secrets by redeploying with new values (all users sign in again). Rotate the Postgres password and
  storage keys in Key Vault, then restart revisions.
