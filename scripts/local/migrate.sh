#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

POSTGRES_PORT="${POSTGRES_PORT:-$(read_env_value POSTGRES_PORT || echo 5432)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB || echo metrolog)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER || echo metrolog)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(read_env_value POSTGRES_PASSWORD || echo metrolog)}"

LOCAL_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

echo "Running migrations against: ${LOCAL_DATABASE_URL}"
env \
  UV_CACHE_DIR=/tmp/uv-cache \
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  uv run --directory backend alembic upgrade head

echo "Migrations complete."
