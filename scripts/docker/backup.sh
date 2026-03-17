#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

service_is_running() {
  local service="$1"
  docker compose ps --status running --services "$service" 2>/dev/null | grep -qx "$service"
}

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

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${1:-$ROOT_DIR/backups/$TIMESTAMP}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER || echo metrolog)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB || echo metrolog)}"

mkdir -p "$BACKUP_DIR"

echo "Creating Docker backup in $BACKUP_DIR"

docker compose ps >"$BACKUP_DIR/compose-ps.txt"

if service_is_running postgres; then
  docker compose exec -T postgres \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip -c >"$BACKUP_DIR/postgres.sql.gz"
else
  echo "Skipping postgres backup: service is not running"
fi

if service_is_running backend; then
  docker compose exec -T backend sh -lc \
    'mkdir -p /app/storage && cd /app/storage && tar -czf - .' \
    >"$BACKUP_DIR/backend-storage.tar.gz"
else
  echo "Skipping backend storage backup: service is not running"
fi

if service_is_running redis; then
  docker compose exec -T redis sh -lc \
    'if [ -f /data/dump.rdb ]; then cat /data/dump.rdb; fi' \
    >"$BACKUP_DIR/redis-dump.rdb"
else
  echo "Skipping redis backup: service is not running"
fi

cat >"$BACKUP_DIR/manifest.txt" <<EOF
created_at=$TIMESTAMP
project_root=$ROOT_DIR
postgres_db=$POSTGRES_DB
postgres_user=$POSTGRES_USER
files:
- compose-ps.txt
- postgres.sql.gz
- backend-storage.tar.gz
- redis-dump.rdb
EOF

echo "Backup completed:"
echo "  - $BACKUP_DIR/postgres.sql.gz"
echo "  - $BACKUP_DIR/backend-storage.tar.gz"
echo "  - $BACKUP_DIR/redis-dump.rdb"
echo "  - $BACKUP_DIR/manifest.txt"
