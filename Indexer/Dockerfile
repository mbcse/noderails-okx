# SUBMISSION_SNAPSHOT: image build/run not supported in this review copy.
# Noderails Indexer — backend server only (frontend deployed separately)
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace and backend only (no admin)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/backend/package.json packages/backend/tsconfig.json packages/backend/prisma.config.ts ./packages/backend/
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/src ./packages/backend/src

# Cache pnpm store and Turbo cache for faster rebuilds (use: docker compose build --build-arg BUILDKIT_INLINE_CACHE=1)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# Prisma generate needs DATABASE_URL in config (not used for generate)
ENV DATABASE_URL=postgresql://submission:disabled@127.0.0.1:1/disabled
# Increase Node.js heap to avoid OOM during TypeScript compilation
ENV NODE_OPTIONS="--max-old-space-size=4096"
WORKDIR /app
RUN --mount=type=cache,target=/app/.turbo \
  pnpm --filter backend exec prisma generate && pnpm exec turbo run build --filter=backend

# Node ESM requires .js on relative imports; Prisma generates extensionless imports
RUN cd /app/packages/backend/dist/generated/prisma && \
  sed 's|from "./internal/class"|from "./internal/class.js"|g; s|from "./internal/prismaNamespace"|from "./internal/prismaNamespace.js"|g; s|from "./enums"|from "./enums.js"|g; s|from '\''./enums'\''|from '\''./enums.js'\''|g' client.js > client.js.tmp && mv client.js.tmp client.js && \
  sed 's|from '\''./internal/prismaNamespaceBrowser'\''|from '\''./internal/prismaNamespaceBrowser.js'\''|g; s|from '\''./enums'\''|from '\''./enums.js'\''|g' browser.js > browser.js.tmp && mv browser.js.tmp browser.js

# Production image
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Reproduce workspace layout so backend resolves node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/tsconfig.json packages/backend/prisma.config.ts ./packages/backend/
COPY packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules

WORKDIR /app/packages/backend

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh","-c","echo submission snapshot: container start disabled; exit 1"]
