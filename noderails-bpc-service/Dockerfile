# SUBMISSION_SNAPSHOT: image build/run not supported in this review copy.
# syntax=docker/dockerfile:1
# NodeRails BPC API server (admin deploys separately on Vercel)
# Build: docker compose build
# Targets: server (default), migrate

FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ openssl

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/

RUN pnpm install --frozen-lockfile --filter @bpc/server...

COPY server ./server
WORKDIR /app/server
RUN PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 pnpm exec prisma generate
RUN pnpm build

WORKDIR /app
RUN pnpm prune --prod

FROM node:20-alpine AS server

RUN apk add --no-cache wget openssl
RUN npm install -g prisma@6.19.3

RUN addgroup --system --gid 1001 bpc && \
    adduser --system --uid 1001 bpc

WORKDIR /app/server

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/prisma ./prisma
COPY --from=builder /app/server/package.json ./package.json
COPY scripts/docker-entrypoint-server.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && chown -R bpc:bpc /app

USER bpc

ENV NODE_ENV=production
ENV PORT=8090
ENV HOME=/tmp

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]

FROM server AS migrate

ENV RUN_MIGRATIONS=true
ENV RUN_SERVER=false
