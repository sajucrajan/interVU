# InterVU API — multi-stage build.
# Build from the REPO ROOT:  docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
# Prisma needs OpenSSL at build and runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependencies (cached on lockfile changes only) ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/matching-core/package.json packages/matching-core/
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @intervu/contracts build \
  && pnpm --filter @intervu/matching-core build \
  && pnpm --filter @intervu/api exec prisma generate \
  && pnpm --filter @intervu/api exec tsc -p tsconfig.json

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
# The seed script imports helpers from src, so ship it too — this is what
# makes `docker compose exec api ./node_modules/.bin/tsx prisma/seed.ts` work.
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
# Migrations run on boot so `compose up` is the whole install story.
# Invoke the Prisma binary directly — `pnpm exec` would re-run a workspace
# dependency check that can't resolve in the slim runtime image.
# Migrations do NOT run here.
#
# Render restarts a free instance on every wake from sleep, so migrating on
# start meant migrating several times a day — and racing the reseed job for
# Prisma's advisory lock, which is what made deploys fail with P1002.
# Migrations belong in one deliberate place: .github/workflows/migrate.yml,
# serialised against the reseed job by a shared concurrency group.
#
# Local compose opts in with RUN_MIGRATIONS_ON_START=true, where there is no
# CI to do it and no second migrator to race.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS_ON_START\" = \"true\" ]; then ./node_modules/.bin/prisma migrate deploy || exit 1; fi; node dist/main.js"]
