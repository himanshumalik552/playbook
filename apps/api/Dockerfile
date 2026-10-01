# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f apps/api/Dockerfile .
ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    TURBO_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && npm install -g corepack@latest \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@adpulse/api...
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @adpulse/api deploy --prod /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    API_PORT=3000 \
    LOCAL_STORAGE_PATH=/app/storage
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.API_PORT + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
# Migrations: docker run --rm <image> node node_modules/@adpulse/database/dist/migrate.js
CMD ["node", "dist/main.js"]
