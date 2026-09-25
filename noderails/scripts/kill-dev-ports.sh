#!/usr/bin/env bash
set -euo pipefail

# Free local ports this repo binds. Do not touch Postgres (5432) or Redis (6379).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTS=(3000 3001 3002 3004 3005 5055 8080)

is_protected() {
  case "$1" in
    *Cursor.app*|*Cursor\ Helper*|*Code\ Helper*|*Visual\ Studio\ Code.app*|/sbin/launchd*|/usr/libexec/xpcproxy*)
      return 0
      ;;
  esac
  return 1
}

listen_pids_on_port() {
  lsof -nP -iTCP:"$1" 2>/dev/null | awk 'NR>1 && /LISTEN/ {print $2}' | sort -u || true
}

kill_chain() {
  local pid=$1
  local n=0
  while [ "$n" -lt 12 ] && [ -n "${pid:-}" ] && [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ]; do
    case "$pid" in
      ''|*[!0-9]*) break ;;
    esac
    if [ "$pid" -le 1 ]; then
      break
    fi
    local cmd
    cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    if [ -z "$cmd" ]; then
      break
    fi
    if is_protected "$cmd"; then
      break
    fi
    local ppid
    ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    kill "$pid" 2>/dev/null || true
    pid="$ppid"
    n=$((n + 1))
  done
}

echo "Stopping listeners on ${PORTS[*]}..."

seen=""
for port in "${PORTS[@]}"; do
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    case " $seen " in
      *" $pid "*) continue ;;
    esac
    seen="$seen $pid"
    echo "  :$port pid $pid  $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-100 || echo gone)"
    kill_chain "$pid"
  done < <(listen_pids_on_port "$port")
done

pkill -f "${ROOT}/apps/" 2>/dev/null || true
pkill -f "${ROOT}/services/noderails-server" 2>/dev/null || true
pkill -f "${ROOT}/noderails-contracts/ops-ui" 2>/dev/null || true

sleep 0.4

for port in "${PORTS[@]}"; do
  leftover="$(listen_pids_on_port "$port" || true)"
  if [ -n "$leftover" ]; then
    echo "Force killing :$port (pid $leftover)"
    # shellcheck disable=SC2086
    kill -9 $leftover 2>/dev/null || true
  fi
done

sleep 0.2
echo "Project app ports are free."
