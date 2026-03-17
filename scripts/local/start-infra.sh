#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Starting infrastructure (postgres + redis)..."
docker compose up -d postgres redis
echo "Done."
