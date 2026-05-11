# metroLog
<img width="1864" height="1025" alt="изображение" src="https://github.com/user-attachments/assets/9b9571a9-f0f1-4691-820d-7303aa52fc28" />

<p align="center">
  <strong>Система учёта средств измерений и эталонов</strong>
</p>

<p align="center">
  <a href="#технологический-стек">Стек</a> •
  <a href="#функционал">Функционал</a> •
  <a href="#архитектура">Архитектура</a> •
  <a href="#запуск">Запуск</a> •
  <a href="#тестирование">Тесты</a>
</p>

---

## Описание

**metroLog** — веб-приложение для автоматизации учёта, поверки и ремонта средств измерений (СИ) и эталонов средств измерений (ЭСИ). Интеграция с ФГИС «Аршин» позволяет импортировать данные о поверках напрямую из государственного реестра.

Приложение разработано для метрологических служб и лабораторий, работающих с измерительным оборудованием.

> **Статус**: production-ready MVP, активно используется в реальном бизнес-процессе

---

## Технологический стек

### Backend
- **Python 3.12**
- **FastAPI** — асинхронный веб-фреймворк
- **SQLAlchemy 2.0** — ORM
- **Alembic** — миграции базы данных
- **Pydantic** — валидация и сериализация
- **PostgreSQL** — основная база данных
- **Redis + RQ** — фоновая обработка (email-уведомления)
- **HMAC-токены** — stateless-аутентификация

### Frontend
- **React 19** + TypeScript
- **Vite** — сборка
- **TanStack Query** — серверное состояние
- **Zustand** — клиентское состояние (auth, темы)
- **Tailwind CSS** — стилизация
- **React Router** — маршрутизация

### Инфраструктура
- **Docker Compose** — контейнеризация
- **GitHub Actions** — CI/CD (self-hosted runner)
- **Nginx** — reverse proxy / статика

---

## Функционал

### Реестр оборудования
- Иерархия: Папки → Группы → Оборудование
- Типы: СИ, ЭСИ, ИО, ВО, Прочее
- Карточка оборудования с полной историей

### Интеграция с Аршин
- Поиск СИ и ЭСИ по номеру свидетельства / регистрационному номеру
- Автоматический импорт данных из ФГИС
- Пакетное обновление папок (folder refresh)

### Процессы
- **Ремонт** — ответственные, этапы, сроки, переписка
- **Поверка** — аналогичный workflow для метрологической поверки
- **Групповые (batch) операции** — массовое создание и редактирование
- **Таймлайн** — визуализация этапов процесса

### Коммуникации
- Комментарии к оборудованию и процессам
- Вложения (изображения, PDF)
- Упоминания `@username`
- Email-уведомления через SMTP
- Приватные заметки

### Управление доступом
- Ролевая модель: DEVELOPER, ADMINISTRATOR, MKAIR, CUSTOMER
- Доступ по папкам (folder-scoping)
- Soft-denial (404 вместо 403 для скрытия существования)

### Отчётность
- Журнал событий (audit log)
- Дашборд с виджетами по папкам
- Экспорт данных

---

## Архитектура

```
┌─────────┐     ┌──────────┐     ┌─────────────┐
│  nginx  │────▶│ frontend │────▶│  Vite build │
│  :80    │     │  :80     │     │             │
└─────────┘     └──────────┘     └─────────────┘
      │
      ▼
┌──────────────────────────────────────────────┐
│           FastAPI (uvicorn, 2 workers)       │
│  - Автомиграции Alembic на старте            │
│  - REST API + static files                   │
└──────────────────────────────────────────────┘
      │                  │
      ▼                  ▼
┌──────────┐    ┌──────────────┐
│ Postgres │    │    Redis     │
│  :5432   │    │    :6379     │
└──────────┘    └──────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  RQ Worker     │
              │  (email queue) │
              └────────────────┘
```

---

## Запуск

### Требования
- Docker + Docker Compose
- Node.js 20+ (для локальной разработки)
- uv (для локального бэкенда)

### Быстрый старт (Docker)

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd metroLog

# 2. Скопировать переменные окружения
cp .env.example .env

# 3. Запустить
npm run docker:up

# 4. Применить миграции (первый запуск)
npm run docker:migrate
```

Приложение будет доступно:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/v1
- Health check: http://localhost:8000/api/v1/health

### Локальная разработка

```bash
# Инфраструктура (Postgres + Redis)
npm run start:infra

# Backend (терминал 1)
npm run dev:backend

# Frontend (терминал 2)
npm run dev:frontend
```

Подробнее в [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Тестирование

```bash
# Backend (pytest, 108 тестов)
npm run test:backend

# Линтеры
npm run lint:backend   # ruff
npm run lint:frontend  # eslint

# Полный чек
npm run check
```

---

## Структура проекта

```
metroLog/
├── backend/
│   ├── app/
│   │   ├── api/v1/routes/     # REST endpoints
│   │   ├── core/              # Config, deps, security
│   │   ├── models/            # SQLAlchemy ORM
│   │   ├── schemas/           # Pydantic models
│   │   ├── services/          # Business logic
│   │   └── tasks/             # Background jobs (RQ)
│   ├── tests/                 # Pytest suite
│   └── alembic/versions/      # DB migrations
├── frontend/
│   ├── src/
│   │   ├── pages/             # Route pages
│   │   ├── components/        # UI components
│   │   ├── api/               # API clients
│   │   └── store/             # Zustand stores
│   └── Dockerfile
├── scripts/                   # Dev & deploy scripts
├── docker-compose.yml
└── package.json               # Root npm scripts
```

---

## CI/CD

Автоматический деплой на продакшен через GitHub Actions:
- **Trigger**: push в `main` или ручной запуск
- **Runner**: self-hosted на продакшен-сервере
- **Pipeline**: backup → build → health check

---

## Лицензия

MIT License — свободное использование с указанием авторства.

---

<p align="center">
  Разработано для автоматизации метрологического учёта
</p>
