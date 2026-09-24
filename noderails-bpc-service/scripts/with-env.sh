#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.example to .env" >&2
  exit 1
fi

DOTENV="$ROOT/node_modules/.bin/dotenv"
if [ ! -x "$DOTENV" ]; then
  echo "dotenv-cli is required. Run pnpm install in the repo root." >&2
  exit 1
fi

exec "$DOTENV" -e "$ENV_FILE" -- "$@"
