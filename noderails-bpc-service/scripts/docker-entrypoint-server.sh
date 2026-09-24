#!/bin/sh
set -e

cd /app/server

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "→ Running Prisma migrations…"
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 prisma migrate deploy --schema=./prisma/schema.prisma
fi

if [ "${RUN_SERVER:-true}" = "true" ]; then
  exec node dist/index.js
fi
