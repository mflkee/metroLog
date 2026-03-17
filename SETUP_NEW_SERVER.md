# Setup On A New Server

## Requirements
- Linux server with SSH access
- `git`
- Docker Engine
- Docker Compose plugin
- open ports for the app or a reverse proxy in front of it
- domain or IP if external access is needed
- working SMTP settings if email features are required

## Quick Deploy
```bash
ssh user@server
git clone https://github.com/mflkee/metroLog.git
cd metroLog
cp .env.example .env
```

Edit `.env`, then start the stack:

```bash
docker compose up -d --build
```

## Minimum `.env`
```env
APP_ENV=production
SECRET_KEY=replace-with-long-random-secret

BOOTSTRAP_ADMIN_FIRST_NAME=System
BOOTSTRAP_ADMIN_LAST_NAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-on-first-run

FRONTEND_APP_URL=https://your-domain.example

BACKEND_PORT=8000
BACKEND_WORKERS=2
FRONTEND_PORT=5173
POSTGRES_PORT=5432
REDIS_PORT=6379

POSTGRES_DB=metrolog
POSTGRES_USER=metrolog
POSTGRES_PASSWORD=replace-db-password

DATABASE_URL=postgresql+psycopg://metrolog:replace-db-password@postgres:5432/metrolog
REDIS_URL=redis://redis:6379/0
BACKEND_CORS_ORIGINS=https://your-domain.example
VITE_API_BASE_URL=/api/v1

NOTIFICATION_QUEUE_ENABLED=true
UPLOAD_MAX_FILE_SIZE_BYTES=25000000
ATTACHMENT_IMAGE_TARGET_SIZE_BYTES=2000000
ATTACHMENT_IMAGE_MAX_DIMENSION_PIXELS=2560

MENTION_NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USERNAME=robot@example.com
SMTP_PASSWORD=replace-smtp-password
SMTP_FROM_EMAIL=robot@example.com
SMTP_FROM_NAME=metroLog Robot
```

## What Docker Starts
- `postgres`
- `redis`
- `backend`
- `backend-worker`
- `frontend`

The backend container runs `alembic upgrade head` on startup and then launches `uvicorn` with `${BACKEND_WORKERS:-2}` workers.  
The worker container processes queued notifications through Redis/RQ.  
The frontend is served by `nginx` as a static build.
The frontend `nginx` proxy is also configured for larger API uploads and downloads without proxy buffering.

## Data Safety
Persistent data lives in named volumes:
- `postgres_data`
- `redis_data`
- `backend_storage`

Regular rebuilds do not delete these volumes:

```bash
docker compose up -d --build
```

Dangerous commands:
- `docker compose down -v`
- manual volume removal

## Useful Commands
Start or update:

```bash
docker compose up -d --build
docker compose pull
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
docker compose logs -f backend-worker
```

Health checks:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/health/ready
curl -fsS http://127.0.0.1:5173
```

Backend shell and migrations:

```bash
docker compose exec backend sh
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
```

Restart:

```bash
docker compose down
docker compose up -d --build
```

## Backups
Recommended helper:

```bash
./scripts/docker/backup.sh
```

Or through npm:

```bash
npm run backup:docker
```

PostgreSQL dump:

```bash
docker compose exec -T postgres pg_dump -U metrolog -d metrolog > metrolog.sql
```

Restore PostgreSQL:

```bash
cat metrolog.sql | docker compose exec -T postgres psql -U metrolog -d metrolog
```

Check volumes:

```bash
docker volume ls | grep metro
```

Copy attachment volume:

```bash
docker run --rm -v metrolog_backend_storage:/from -v "$PWD":/to alpine sh -c "cp -r /from /to/backend_storage_backup"
```

If the compose project name is not `metrolog`, volume prefixes will differ. Check them through `docker volume ls`.

## Recommended Update Order
```bash
cd ~/metroLog
git pull
./scripts/docker/backup.sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

After update, verify:
- backend started without migration errors
- frontend opens
- login works
- attachments still download
- emails still send if SMTP is enabled

## Before Going Live
- replace `SECRET_KEY`
- replace bootstrap admin password
- replace database and SMTP passwords
- restrict ports through firewall or reverse proxy
- enable HTTPS
- configure scheduled backups for database and `backend_storage`
- verify SMTP delivery

## If Only Data Must Be Moved
Move at minimum:
- PostgreSQL dump
- `backend_storage` volume contents
- current `.env`

Application code can then be deployed fresh from git and the data restored afterward.
