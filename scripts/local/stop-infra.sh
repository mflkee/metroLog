#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Stopping infrastructure (postgres + redis)..."
docker compose stop postgres redis
echo "Done."
