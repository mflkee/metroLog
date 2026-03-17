# metroLog Setup

Этот документ покрывает два сценария:

1. локальный запуск без Docker;
2. запуск на новом сервере через Docker Compose.

## Что важно сразу

- Не запускай `docker-compose up docker-compose.yml`.
  Это неверно: `docker-compose.yml` не сервис.
- Правильная команда: `docker compose up --build`.
- Если видишь `docker.sock: no such file or directory`, значит Docker daemon не запущен.
- Файл `.env.example` по умолчанию заточен под Docker. Для локального запуска без Docker его нужно немного поправить.

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

### 1. Подготовить `.env`

```bash
cp .env.example .env
```

Открой `.env` и измени минимум вот это:

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

# Для локального запуска без Docker:
# либо удаляй DATABASE_URL совсем,
# либо укажи SQLite явно.
DATABASE_URL=sqlite+pysqlite:///./metrolog.db

# Redis сейчас не критичен для локального старта,
# но можно оставить локальное значение.
REDIS_URL=redis://localhost:6379/0

VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://localhost:8000
```

Критичный момент:

- если оставить `DATABASE_URL=postgresql+psycopg://...@postgres:5432/...`, backend локально не поднимется, потому что хост `postgres` существует только внутри Docker Compose;
- если оставить `VITE_API_PROXY_TARGET=http://backend:8000`, frontend локально не достучится до backend.

### 2. Установить зависимости backend

```bash
uv sync --directory backend --dev
```

### 3. Установить зависимости frontend

```bash
npm --prefix frontend ci
```

### 4. Поднять backend

В одном терминале:

```bash
npm run dev:backend
```

Backend будет доступен на:

```text
http://localhost:8000
http://localhost:8000/docs
```

### 5. Поднять frontend

Во втором терминале:

```bash
npm run dev:frontend
```

Frontend будет доступен на:

```text
http://localhost:5173
```

### 6. Войти в систему

Используй bootstrap-админа из `.env`:

```text
email: admin@metrolog.local
password: ChangeMe123
```

После первого входа система потребует сменить пароль.

### Полезные команды

Проверка backend:

```bash
npm run test:backend
npm run lint:backend
```

Проверка frontend:

```bash
npm run test:frontend
npm run lint:frontend
npm run build:frontend
```

## Вариант 2. Запуск на новом сервере через Docker Compose

Этот вариант проще для сервера, если Docker уже установлен и daemon запущен.

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

### 3. Запустить контейнеры

```bash
docker compose up --build -d
```

### 4. Проверить, что всё поднялось

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

## Что у тебя уже сломалось и почему

### Ошибка

```bash
docker-compose up docker-compose.yml
```

Почему:

- `docker-compose.yml` был воспринят как имя сервиса.

Нужно:

```bash
docker compose up --build
```

### Ошибка

```bash
docker-compose up
env file .../.env not found
```

Почему:

- compose-файл требует `.env`.

Нужно:

```bash
cp .env.example .env
```

### Ошибка

```bash
failed to connect to the docker API at unix:///var/run/docker.sock
```

Почему:

- Docker daemon не запущен.

Нужно:

```bash
sudo systemctl enable --now docker
docker info
```

## Самый короткий путь запустить прямо сейчас

Если не хочешь разбираться с Docker на этом этапе:

```bash
cp .env.example .env
```

Потом в `.env` поставь:

```dotenv
DATABASE_URL=sqlite+pysqlite:///./metrolog.db
VITE_API_PROXY_TARGET=http://localhost:8000
```

И дальше:

```bash
uv sync --directory backend --dev
npm --prefix frontend ci
npm run dev:backend
npm run dev:frontend
```
