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

POSTGRES_PORT="${POSTGRES_PORT:-$(read_env_value POSTGRES_PORT || echo 5432)}"
REDIS_PORT="${REDIS_PORT:-$(read_env_value REDIS_PORT || echo 6379)}"
BACKEND_PORT="${BACKEND_PORT:-$(read_env_value BACKEND_PORT || echo 8000)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB || echo metrolog)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER || echo metrolog)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(read_env_value POSTGRES_PASSWORD || echo metrolog)}"

docker compose up -d postgres redis
docker compose stop backend frontend >/dev/null 2>&1 || true

LOCAL_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
LOCAL_REDIS_URL="redis://127.0.0.1:${REDIS_PORT}/0"

env \
  UV_CACHE_DIR=/tmp/uv-cache \
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  REDIS_URL="$LOCAL_REDIS_URL" \
  uv run --directory backend alembic upgrade head

env \
  UV_CACHE_DIR=/tmp/uv-cache \
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  REDIS_URL="$LOCAL_REDIS_URL" \
  uv run --directory backend uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
