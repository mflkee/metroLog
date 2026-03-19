# Backend

FastAPI backend for metroLog.

## Quick start

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
