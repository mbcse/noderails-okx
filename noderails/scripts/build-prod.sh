#!/usr/bin/env bash
set -euo pipefail

# Next production bundles for Dev: all. The API still runs `tsx watch`.
# Server turbo build is only so workspace packages (database, common, …) exist on disk.
# NEXT_PUBLIC_* must come from dev_frontend at Next build time.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building workspace packages the API imports (dev_backend)..."
bash "$ROOT/scripts/with-doppler.sh" pnpm exec turbo run build --filter=@noderails/server

echo "Building Next apps (dev_frontend — NEXT_PUBLIC_* inlined)..."
bash "$ROOT/scripts/with-frontend-env.sh" pnpm exec turbo run build \
  --concurrency=2 \
  --filter=@noderails/dashboard \
  --filter=@noderails/payment-ui \
  --filter=@noderails/landing \
  --filter=@noderails/admin

echo "Next production builds are ready. API will run with tsx watch."
