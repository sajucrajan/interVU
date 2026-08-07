# InterVU web — multi-stage build using Next.js standalone output.
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/matching-core/package.json packages/matching-core/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/web apps/web
# Baked at build time — point it at your API's public URL.
# Every NEXT_PUBLIC_* value is inlined into the client bundle at BUILD time,
# so each one has to be declared here — passing it as a runtime variable does
# nothing. Defaults keep a plain `docker build` behaving like local dev.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ARG NEXT_PUBLIC_DEMO_ORG=acme
ENV NEXT_PUBLIC_DEMO_ORG=$NEXT_PUBLIC_DEMO_ORG
ARG NEXT_PUBLIC_DEMO_PASSWORD=intervu-demo
ENV NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD
RUN pnpm --filter @intervu/web build

FROM base AS runtime
ENV NODE_ENV=production
# Next standalone bundles only what the server actually needs.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
