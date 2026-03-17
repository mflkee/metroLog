# metroLog

Foundation stage for the equipment accounting and repair tracking system.

## Included in this stage

- FastAPI backend skeleton with health endpoints
- Alembic configuration
- React + TypeScript frontend skeleton with a shared application shell
- Docker Compose definition for PostgreSQL, Redis, backend, and frontend
- Base test and lint configuration

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
```

## Local commands

From the project root:

```bash
npm run dev:frontend
npm run build:frontend
npm run test:frontend

npm run dev:backend
npm run test:backend
npm run lint:backend
```

## Docker

When Docker is available:

```bash
cp .env.example .env
docker compose up --build
```

## Notes

- The backend defaults to SQLite locally if `DATABASE_URL` is not set.
- Docker startup was not verified in this environment because Docker is not installed.

