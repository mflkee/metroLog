#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

env UV_CACHE_DIR=/tmp/uv-cache uv run --directory backend alembic upgrade head
env UV_CACHE_DIR=/tmp/uv-cache uv run --directory backend uvicorn app.main:app --reload --host 0.0.0.0 --port "${BACKEND_PORT:-8000}"
