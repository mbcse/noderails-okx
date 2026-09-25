#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/kill-dev-ports.sh"

exec pnpm exec concurrently -k -p "{name}" -c "bgBlue,bgGreen,bgMagenta,bgCyan,bgRed,bgYellow" \
  -n server,dashboard,payment-ui,landing,admin,ops-ui \
  "bash scripts/with-doppler.sh pnpm --filter @noderails/server dev" \
  "bash scripts/with-frontend-env.sh pnpm --filter @noderails/dashboard dev" \
  "bash scripts/with-frontend-env.sh pnpm --filter @noderails/payment-ui dev" \
  "bash scripts/with-frontend-env.sh pnpm --filter @noderails/landing dev" \
  "bash scripts/with-frontend-env.sh pnpm --filter @noderails/admin dev" \
  "pnpm --filter noderails-contracts-ops-ui start"
