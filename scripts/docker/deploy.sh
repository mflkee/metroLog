#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if [[ "${SKIP_DOCKER_BACKUP_BEFORE_DEPLOY:-0}" != "1" ]]; then
  "$ROOT_DIR/scripts/docker/backup.sh"
fi

docker compose up -d --build
"$ROOT_DIR/scripts/docker/smoke.sh"
