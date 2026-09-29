# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f apps/worker/Dockerfile .
ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    TURBO_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@adpulse/worker...
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @adpulse/worker deploy --prod /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# Chromium renders PDF reports; the distro build receives security updates with the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini chromium fonts-liberation fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    WORKER_HEALTH_PORT=3001 \
    LOCAL_STORAGE_PATH=/app/storage \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    XDG_CONFIG_HOME=/tmp/.config \
    XDG_CACHE_HOME=/tmp/.cache
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.WORKER_HEALTH_PORT + '/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
