# Backend

FastAPI backend for metroLog.

Current backend scope already includes:
- equipment registry and equipment card APIs,
- repair and verification process APIs with archive ZIP export,
- Arshin-backed SI onboarding,
- application-level event journal under `/api/v1/events`.

## Quick start

Runtime expects PostgreSQL and Redis. For the recommended local dev flow,
start the app from the project root with `npm run start:backend`,
which brings up `postgres` and `redis` through Docker Compose
and then runs Alembic plus Uvicorn locally.

If you are already inside `backend/` and have `DATABASE_URL` / `REDIS_URL`
pointing at working services, the minimal manual flow is:

```bash
env UV_CACHE_DIR=/tmp/uv-cache uv sync --dev
env UV_CACHE_DIR=/tmp/uv-cache uv run alembic upgrade head
env UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Tests

```bash
env UV_CACHE_DIR=/tmp/uv-cache uv run pytest
env UV_CACHE_DIR=/tmp/uv-cache uv run ruff check .
```
