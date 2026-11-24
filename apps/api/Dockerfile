# syntax=docker/dockerfile:1
# NestJS API image. Build from the repo root:  docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ---- Build: install the workspace deps for api only, generate Prisma client, compile ----
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# pnpm applies patches/ on every install (see patchedDependencies in pnpm-workspace.yaml).
COPY patches patches
COPY packages/config/package.json packages/config/
# Workspace packages the API depends on (consent is a test-only dev dependency).
COPY packages/consent/package.json packages/consent/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @getsetgo/api...
COPY packages/config packages/config
COPY apps/api apps/api
RUN pnpm --filter @getsetgo/api build \
 && pnpm --filter @getsetgo/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts /out/
# Fetch Prisma's migration engine now, so containers never download binaries at startup.
RUN cd /out && ./node_modules/.bin/prisma version

# ---- Runtime: production deps + compiled code, non-root ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
# Apply pending migrations, then start. (On Render this is split into a pre-deploy step.)
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
