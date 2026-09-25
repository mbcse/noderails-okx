#!/usr/bin/env bash
# Submission snapshot: frontend env wrapper passthrough.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/with-doppler.sh" "$@"
