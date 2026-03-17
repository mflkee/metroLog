# metroLog

Foundation stage for the equipment accounting and repair tracking system.

## Included in this stage

- FastAPI backend skeleton with health endpoints
- Alembic configuration
- React + TypeScript frontend skeleton with a shared application shell
- Docker Compose definition for PostgreSQL, Redis, backend, and frontend
- Base test and lint configuration
- Stage 1 auth foundation with internal login, bootstrap admin, and administrator-managed user accounts

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

Dependencies are installed at image build time, so container startup should go straight into
database migrations and app boot without rerunning `uv sync` or `npm install`.

### Bootstrap administrator

The MVP auth model is internal and administrator-driven.
On startup the backend ensures that at least one administrator exists using these settings:

```bash
BOOTSTRAP_ADMIN_DISPLAY_NAME=Bootstrap Administrator
BOOTSTRAP_ADMIN_EMAIL=admin@metrolog.local
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123
```

If no administrator exists, this account is created automatically and is forced to change its
password on first login.

### Email delivery

By default the project uses `EMAIL_DELIVERY_MODE=console`.
Email delivery is optional and not required for the current MVP auth flow.

To send real email, set:

```bash
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_SENDER=...
SMTP_USE_TLS=true
```

### API access in browser

The frontend uses a same-origin `/api/v1` base URL by default.
In Docker and remote access scenarios, Vite proxies `/api` requests to the backend service, which
avoids mixed-content and `localhost` issues when the UI is opened through HTTPS or a public domain.

## Notes

- The backend defaults to SQLite locally if `DATABASE_URL` is not set.
