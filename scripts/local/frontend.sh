#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

read_env_value() {
  local key="$1"

  if [[ ! -f .env ]]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  printf '%s\n' "${line#*=}"
}

FRONTEND_PORT="${FRONTEND_PORT:-$(read_env_value FRONTEND_PORT || echo 5173)}"
BACKEND_PORT="${BACKEND_PORT:-$(read_env_value BACKEND_PORT || echo 8000)}"

docker compose stop frontend >/dev/null 2>&1 || true

env \
  FRONTEND_PORT="$FRONTEND_PORT" \
  VITE_API_PROXY_TARGET="http://localhost:${BACKEND_PORT}" \
  npm --prefix frontend run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
