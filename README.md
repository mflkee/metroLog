# metroLog

Equipment accounting and repair tracking system.

## Current state

- Stage 1 auth and user management are working
- Stage 2 registry foundation is in progress
- verification flow already includes active/archive queues, grouped verification, shared batch dialog, archive ZIP export, and archive links from the equipment card
- repairs now also have active/archive queues, grouped batch behavior, archive ZIP export, and archive links from the equipment card
- `/events` is implemented as a working audit-style journal for equipment, repair, and verification actions
- folder colors were removed from the product
- folder list now relies on compact cards plus search, not color coding

## Project structure

```text
/
  backend/
  frontend/
  mvpexcel/
  codex.md
  backend/codex.md
  frontend/codex.md
  development.md
  docker-compose.yml
  .env.example
  scripts/
```

## Recommended workflow

For active development, run backend and frontend locally in separate processes.
Use Docker for integration checks and deployment-style smoke tests.

## Local development

Initial setup:

```bash
npm run setup:local
```

Run backend:

```bash
npm run start:backend
```

Run frontend:

```bash
npm run start:frontend
```

Checks:

```bash
npm run check
```

## Docker

When Docker is available and you want a full stack rebuild with migrations:

```bash
npm run deploy:docker
```

This script:

- ensures `.env` exists,
- rebuilds containers,
- starts the stack,
- waits for backend health,
- checks frontend reachability.

### Bootstrap administrator

The MVP auth model is internal and administrator-driven.
On startup the backend ensures that at least one administrator exists using these settings:

```bash
BOOTSTRAP_ADMIN_FIRST_NAME=Bootstrap
BOOTSTRAP_ADMIN_LAST_NAME=Administrator
BOOTSTRAP_ADMIN_PATRONYMIC=
BOOTSTRAP_ADMIN_EMAIL=admin@metrolog.local
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123
```

If no administrator exists, this account is created automatically and must change its password on first login.

### API access in browser

The frontend uses a same-origin `/api/v1` base URL by default.
In Docker and remote access scenarios, Vite proxies `/api` requests to the backend service, which
avoids mixed-content and `localhost` issues when the UI is opened through HTTPS or a public domain.

## Useful commands

```bash
npm run lint:backend
npm run test:backend
npm run lint:frontend
npm run test:frontend
npm run build:frontend
npm run smoke:docker
```

## Notes

- runtime and local development use PostgreSQL and Redis
- SQLite remains only in backend tests as an isolated test fixture
- Docker uses PostgreSQL and Redis from `docker-compose.yml`
- the shared specification lives in `codex.md`, `backend/codex.md`, `frontend/codex.md`, and `development.md`
