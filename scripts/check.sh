#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run lint:backend
npm run test:backend
npm run lint:frontend
npm run test:frontend
npm run build:frontend
