#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Show logs for infrastructure services (postgres, redis) and optionally app containers if they are running
echo "Showing logs. Press Ctrl+C to stop."
docker compose logs -f "$@"
