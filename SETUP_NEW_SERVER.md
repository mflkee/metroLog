# metroLog Setup

Этот документ покрывает два сценария:

1. локальная разработка без Docker;
2. запуск на сервере через Docker Compose.

## Вариант 1. Локальный запуск без Docker

### Требования

- `node` и `npm`
- `uv`
- Python `3.12+`

Проверка:

```bash
node --version
npm --version
uv --version
python3 --version
```

### 1. Подготовить локальную среду

```bash
npm run setup:local
```

Если нужно вручную поправить `.env`, ориентируйся на такой минимум:

```dotenv
APP_ENV=development
APP_NAME=metroLog
SECRET_KEY=change-me

BOOTSTRAP_ADMIN_FIRST_NAME=Bootstrap
BOOTSTRAP_ADMIN_LAST_NAME=Administrator
BOOTSTRAP_ADMIN_PATRONYMIC=
BOOTSTRAP_ADMIN_EMAIL=admin@metrolog.local
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123

FRONTEND_APP_URL=http://localhost:5173
BACKEND_CORS_ORIGINS=http://localhost:5173

# Для локального запуска backend работает локально,
# но PostgreSQL и Redis поднимаются через docker compose.
POSTGRES_DB=metrolog
POSTGRES_USER=metrolog
POSTGRES_PASSWORD=metrolog
POSTGRES_PORT=5432
REDIS_PORT=6379

VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://localhost:8000
```

Критично:

- локальный `backend`-скрипт сам поднимает `postgres` и `redis` через `docker compose`;
- `postgres` и `backend` как hostname работают только внутри Docker Compose;
- для локального dev сам `app` лучше держать отдельно от Docker, так быстрее и проще отлаживать.

### 2. Поднять backend

В одном терминале:

```bash
npm run start:backend
```

Backend будет доступен на:

```text
http://localhost:8000
http://localhost:8000/docs
```

### 3. Поднять frontend

Во втором терминале:

```bash
npm run start:frontend
```

Frontend будет доступен на:

```text
http://localhost:5173
```

### 4. Войти в систему

Используй bootstrap-админа из `.env`:

```text
email: admin@metrolog.local
password: ChangeMe123
```

После первого входа система потребует сменить пароль.

### Полезные команды

```bash
npm run check
```

## Вариант 2. Запуск на новом сервере через Docker Compose

Этот вариант нужен для интеграционной проверки и серверного запуска.

### 1. Убедиться, что Docker работает

```bash
docker version
docker compose version
```

Если daemon не запущен, на systemd-сервере обычно помогает:

```bash
sudo systemctl enable --now docker
```

Проверка:

```bash
docker info
```

### 2. Подготовить `.env`

```bash
cp .env.example .env
```

Для базового запуска можно оставить значения из примера.

Если сервер внешний, рекомендую минимум поменять:

```dotenv
SECRET_KEY=change-me-now
BOOTSTRAP_ADMIN_EMAIL=your-email@example.com
BOOTSTRAP_ADMIN_PASSWORD=StrongPass123
BACKEND_CORS_ORIGINS=http://your-host:5173
FRONTEND_APP_URL=http://your-host:5173
```

### 3. Запустить стек

```bash
npm run deploy:docker
```

### 4. Дополнительная проверка

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

### 5. Остановить

```bash
docker compose down
```

Если нужно удалить и volumes:

```bash
docker compose down -v
```

## Типовые ошибки

### `env file .../.env not found`

Создай `.env`:

```bash
cp .env.example .env
```

### `failed to connect to the docker API at unix:///var/run/docker.sock`

Запусти Docker daemon:

```bash
sudo systemctl enable --now docker
docker info
```

### Локально backend не может подключиться к БД

Скорее всего, в `.env` остался Docker-host `postgres`, а backend поднят вне Compose. Для локального запуска используй `npm run start:backend`: он сам поднимет `postgres` и `redis` в Docker и подставит локальный `127.0.0.1`-URL.

## Самый короткий путь запустить прямо сейчас

Если не хочешь вручную собирать локальную среду:

```bash
cp .env.example .env
```

Потом просто:

```bash
npm run setup:local
npm run start:backend
npm run start:frontend
```
