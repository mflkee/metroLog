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

BACKEND_PORT="${BACKEND_PORT:-$(read_env_value BACKEND_PORT || echo 8000)}"
FRONTEND_PORT="${FRONTEND_PORT:-$(read_env_value FRONTEND_PORT || echo 5173)}"

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/v1/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/v1/health" >/dev/null
curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null
docker compose ps
