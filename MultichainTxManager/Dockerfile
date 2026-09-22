# SUBMISSION_SNAPSHOT: image build/run not supported in this review copy.
# ─────────────────────────────────────────────────────────────
# Stage 1 — Install dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests for all workspace packages the backend needs
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install all dependencies (prod + dev — needed for build step)
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2 — Build
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy workspace root configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

# Build shared package first, then backend
RUN pnpm --filter @mtxm/shared build
# Dummy URL — prisma generate only reads the schema, doesn't connect
RUN DATABASE_URL="postgresql://submission:disabled@127.0.0.1:1/disabled" pnpm --filter @mtxm/backend db:generate
RUN pnpm --filter @mtxm/backend build

# ─────────────────────────────────────────────────────────────
# Stage 3 — Production image
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Security: run as non-root
RUN addgroup -S mtxm && adduser -S mtxm -G mtxm

WORKDIR /app

# Copy workspace root manifests (needed for pnpm workspace resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built shared package
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Copy backend package.json + built output
COPY --from=build /app/apps/backend/package.json apps/backend/package.json
COPY --from=build /app/apps/backend/dist apps/backend/dist

# Copy Prisma config, schema + migrations (needed for migrate deploy at startup)
COPY --from=build /app/apps/backend/prisma.config.ts apps/backend/prisma.config.ts
COPY --from=build /app/apps/backend/prisma apps/backend/prisma

# Copy generated Prisma client
COPY --from=build /app/apps/backend/src/generated apps/backend/src/generated

# Install all dependencies (prisma needed for migrate at startup)
RUN pnpm install --frozen-lockfile

# Switch to non-root user
USER mtxm

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Run migrations then start the server (use node for compiled JS, not tsx)
CMD ["sh","-c","echo submission snapshot: container start disabled; exit 1"]
