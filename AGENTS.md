# metroLog Development Guide

## ⚠️ Working rule: verify on the server, deploy via Actions

> **All work is executed and verified on the server `mkair-server-tmn`** (Netbird `100.89.18.223`),
> **not** on a local machine. Do not build, run or deploy locally.
>
> **Deploy only via GitHub Actions** (push):
> - push to `main` → **Stage** (`.github/workflows/ci.yml`);
> - push to `release/*`, or run `promote.yml` manually → **Prod**.
>
> Stage and Prod both live on that host in `~/apps/metroLog`; runner is
> `[self-hosted, mkair-runner]` (`mkair-server-tmn`). Verify the result on the server
> (`docker compose ps`, logs, smoke test).

## 1. Product Snapshot

`metroLog` is an internal equipment-accounting system for managing measurement instruments (`СИ`) and etalons (`ЭСИ`).

**Core flows:**
- Equipment registry organized by folders and groups.
- Equipment card with Arshin-backed onboarding for `SI` and `ESI`.
- Repairs and verifications (single + grouped/batch) with milestone tracking.
- Folder-level Arshin refresh (review/apply, never blind auto-update).
- Event journal (audit log).
- Dashboard with per-folder widgets.
- Comments, attachments, `@mentions`, process subscriptions.

**Roles:**
| Role | Scope |
|------|-------|
| `DEVELOPER` | Full access; can create/manage other `DEVELOPER`s. |
| `ADMINISTRATOR` | Full access; user/role/folder management. |
| `MKAIR` | Operator access in allowed folders; can edit equipment, repairs, verifications. Auto-granted access to new folders. |
| `CUSTOMER` | Read-oriented in allowed folders; comments, attachments, subscriptions, journal. Cannot create private notes or modify processes. |

Folder scoping is enforced via `users.allowed_folder_ids` (JSON list). `ADMINISTRATOR`/`DEVELOPER` bypass it (`None` = all folders). `_assert_folder_access(folder_id)` raises 404 for soft denial.

---

## 2. Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   nginx     │────▶│   frontend   │────▶│  Vite static    │
│  (port 80)  │     │  (port 80)   │     │   build         │
└─────────────┘     └──────────────┘     └─────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│              FastAPI backend (uvicorn, 2+ workers)       │
│  - Auto-runs alembic on startup                          │
│  - Registry, repairs, verifications, Arshin integration  │
└──────────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
┌──────────────┐           ┌──────────────────┐
│  PostgreSQL  │           │      Redis       │
│  (port 5432) │           │   (port 6379)    │
│  metrolog DB │           │   RQ Job Queue   │
└──────────────┘           └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  backend-worker  │
                           │  (RQ Worker)     │
                           │  Email queue     │
                           └──────────────────┘
```

- **Backend**: FastAPI + SQLAlchemy 2 + Alembic + RQ (Redis Queue) for email notifications.
- **Frontend**: React + Vite + TanStack Query + Zustand (auth, theme) + Tailwind CSS with a bespoke design system (no shadcn/ui).
- **Infra**: Docker Compose (postgres, redis, backend, backend-worker, frontend). Persistent data in named volumes.

---

## 3. Repo Map

### Backend (`backend/`)
| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI bootstrap, lifespan, middleware, static mount. |
| `app/core/config.py` | Pydantic-settings: DB/Redis URLs, auth, SMTP, Arshin, upload limits. |
| `app/core/deps.py` | `get_db`, `get_current_user`, `require_admin`, `require_operator`. |
| `app/db/session.py` | SQLAlchemy engine + session factory. |
| `app/models/` | All ORM models: `user.py`, `equipment.py`, `event.py`. |
| `app/schemas/` | Pydantic request/response schemas. |
| `app/repositories/` | Thin SQLAlchemy query wrappers. |
| `app/services/equipment_service.py` | Main domain service (~10k lines): registry, repairs, verifications, comments, attachments, exports, batch flows, folder refresh. |
| `app/services/user_service.py` | Auth, bootstrap admin, roles, folder access. |
| `app/services/event_service.py` | Audit journal. |
| `app/services/arshin_service.py` | Arshin search and detail fetch. |
| `app/services/folder_refresh_matcher.py` | Two-stage Arshin matcher for folder refresh. |
| `app/services/notification_service.py` | SMTP email dispatch. |
| `app/tasks/worker.py` | RQ worker bootstrap. |
| `app/tasks/notifications.py` | Enqueued email jobs. |
| `app/integrations/arshin_client.py` | HTTP client for FGIS Arshin API. |
| `app/api/v1/routes/equipment.py` | Main HTTP surface: folders, equipment, repairs, verifications, attachments, comments, exports, imports, refresh. |
| `app/api/v1/routes/auth.py` | Login, me, change password. |
| `app/api/v1/routes/users.py` | User CRUD, role management. |
| `app/api/v1/routes/events.py` | Event journal. |
| `app/api/v1/routes/arshin.py` | Arshin proxy endpoints. |
| `app/api/v1/routes/health.py` | Liveness + readiness (DB + Redis). |
| `alembic/versions/` | 49 migrations. |

### Frontend (`frontend/`)
| File | Purpose |
|------|---------|
| `src/app/router.tsx` | Browser router, lazy-loaded pages, guards. |
| `src/app/ShellLayout.tsx` | Auth shell with sidebar + topbar. |
| `src/app/RouteGuards.tsx` | `RequireAuth`, `RequireGuest`, `RequireRoles`. |
| `src/store/auth.ts` | Zustand auth store (token in localStorage). |
| `src/store/theme.ts` | Zustand theme store (10 themes, `data-theme` attr). |
| `src/api/client.ts` | Thin `fetch` wrapper, `ApiError`, bearer injection. |
| `src/api/equipment.ts` | Domain API (~4.2k lines): CRUD, repairs, verifications, comments, attachments, ESI, folder refresh. |
| `src/api/arshin.ts` | Arshin search, detail, status probe. |
| `src/pages/DashboardPage.tsx` | Folder-scoped dashboard widgets. |
| `src/pages/EquipmentPage.tsx` | Registry: folders, groups, pagination, bulk actions, modals. |
| `src/pages/EquipmentDetailsPage.tsx` | Equipment card: SI/ESI/OTHER, comments, attachments, ESI composition. |
| `src/pages/RepairsPage.tsx` | Repair queue: grouped batches, milestones, messages. |
| `src/pages/VerificationPage.tsx` | Verification queue: same UX as repairs. |
| `src/pages/ArshinPage.tsx` | Arshin search (SI/ESI), add-to-folder flow. |
| `src/pages/EsiMonitoringPage.tsx` | Folder-level ESI monitoring table. |
| `src/pages/EventsPage.tsx` | Audit journal. |
| `src/pages/SettingsPage.tsx` | User settings, dashboard prefs, admin deadline presets. |
| `src/components/Modal.tsx` | Portal-based modal system. |
| `src/components/DateInput.tsx` | `react-day-picker` popover, Russian locale. |
| `src/components/AutocompleteInput.tsx` | Floating autocomplete menu with keyboard nav. |
| `src/components/AttachmentPreviewList.tsx` | Lazy-loaded image/PDF previews. |
| `src/components/ProcessTimelineStrip.tsx` | Visual timeline for repairs/verifications. |
| `src/components/ProcessStageInlineControls.tsx` | Milestone date editing + custom stages. |
| `src/lib/milestoneValidation.ts` | Milestone order validation rules. |
| `src/lib/processVariants.ts` | Repair/verification preset variant helpers. |
| `src/lib/esiModules.ts` | ESI module extraction helpers. |
| `src/lib/useQueuedAutoSave.ts` | Debounced mutation queue for auto-save UX. |
| `src/content/user-guide.ru.txt` | Raw help text for `HelpPage`. |

### Scripts & Ops
| File | Purpose |
|------|---------|
| `scripts/docker/backup.sh` | Postgres + storage + Redis dump with manifest. |
| `scripts/docker/deploy.sh` | Backup → `docker compose up -d --build` → smoke test. |
| `scripts/docker/smoke.sh` | Polls `/health/ready` up to 30s. |
| `scripts/local/setup.sh` | Initial local setup (`uv sync`, `npm ci`). |
| `scripts/local/backend.sh` | Local backend (postgres/redis in Docker, uvicorn --reload). |
| `scripts/local/frontend.sh` | Local Vite dev server with proxy. |
| `scripts/local/devbox-shared-db.sh` | Tmux devbox: 3 panes (backend, frontend, worker). |
| `scripts/server/setup-runner.sh` | GitHub Actions self-hosted runner installer. |
| `.github/workflows/ci.yml` | GHCR build (backend/frontend) + deploy: `main` → Stage, `release/*` → Prod. |
| `.github/workflows/promote.yml` | Manual promote Stage image → Prod / rollback by `sha-<hash>`. |

---

## 4. Local Development

### Prerequisites
- `uv`, `node`/`npm`, `docker`, `tmux`
- `.env` copied from `.env.example`

### Devbox (recommended)
```bash
# 1. Ensure postgres + redis containers are up (or let devbox handle isolated redis)
docker compose up -d postgres redis

# 2. Start devbox (backend:8001, frontend:5174, isolated redis:6380)
npm run devbox:shared-db up

# Attach later
npm run devbox:shared-db:attach
# Detach: Ctrl-b d
```

### Manual (two terminals)
```bash
# Terminal 1: backend with hot-reload on :8000
npm run start:backend

# Terminal 2: frontend Vite dev on :5173
npm run start:frontend
```

### Direct commands
```bash
npm run dev:backend        # uvicorn --reload
npm run dev:backend-worker # RQ worker (queue must be enabled)
npm run dev:frontend       # Vite dev
npm run test:backend       # pytest
npm run lint:backend       # ruff check
npm run lint:frontend      # eslint
npm run build:frontend     # production build
npm run check              # full check suite
```

---

## 5. CI/CD

**Self-hosted GitHub Actions runner**: host `mkair-server-tmn` (Netbird `100.89.18.223`),
systemd service `actions.runner.mflkee-metroLog.mkair-runner.service`, labels `[self-hosted, mkair]`,
runner dir `~/actions-runner-metrolog`. Прод и Stage живут на этом же хосте в `~/apps/metroLog`.

**Пайплайн = GHCR (build once → registry → pull-based deploy).** Workflows:

| Workflow | Trigger | Назначение |
|----------|---------|-----------|
| `.github/workflows/ci.yml` | push `main` / `release/*`, manual | собрать образы → запушить в GHCR → задеплоить |
| `.github/workflows/promote.yml` | manual `workflow_dispatch` | promote протестированного образа в прод (`tag=staging`) или откат (`tag=sha-<hash>`) |

Образы: `ghcr.io/mflkee/metrolog-backend` и `ghcr.io/mflkee/metrolog-frontend`.
Теги: `main` → `:staging` + `:sha-<sha>`; `release/*` → `:latest` + `:sha-<sha>`.

`ci.yml` jobs:
1. `build-images` — `actions/checkout`, login GHCR, buildx, build & push backend + frontend (cache `type=gha`).
2. `deploy-staging` (только `main`) — `git reset --hard origin/main` в `~/apps/metroLog`,
   `POSTGRES_STG_PORT=5439 IMAGE_TAG=staging docker compose -p metrolog-stg -f docker-compose.staging.yml pull && up -d`,
   health-check `:9000`.
3. `deploy-prod` (только `release/*`) — `git reset --hard origin/<release>`, `pg_dump` в `~/.backups/`,
   `IMAGE_TAG=latest docker compose pull && up -d`, health-check `:8000`.

В `docker-compose*.yml` образы параметризованы: `image: ghcr.io/mflkee/metrolog-backend:${IMAGE_TAG:-latest}`
(аналогично frontend); `build:` остаётся как fallback для локальной сборки.

**Monitoring infrastructure** (отдельный compose-проект `~/apps/monitoring`):
- Prometheus (`127.0.0.1:9091`)
- Grafana (`192.168.1.84:8090`)
- Node Exporter, cAdvisor, Alertmanager, Blackbox Exporter

### Версионирование

SemVer `MAJOR.MINOR.PATCH`. Единый источник версии — `frontend/package.json`; она
инжектится в бандл на сборке (`__APP_VERSION__`, см. `vite.config.ts`) и показана
бейджем `vX.Y.Z · beta` в шапке (`AppVersionBadge`). Пока версия < `1.0.0`, сервис
считается бетой — бейдж всегда несёт канал `beta`.

Правила бампа (одна версия на релиз, не на каждый коммит; в git — тег `vX.Y.Z`):
- `PATCH` (`0.1.1`) — багфиксы и внутренние изменения;
- `MINOR` (`0.2.0`) — новые пользовательские возможности (а до `1.0.0` — и breaking-изменения);
- `MAJOR` (`1.0.0`) — первый стабильный релиз.

Бампить при promote Stage → Prod (`promote.yml` / `release/*`).

---

## 6. Database Schema (Key Entities)

**Users & Auth**
- `users` — id, first/last/patronymic, email (unique), password_hash, role (`DEVELOPER`/`ADMINISTRATOR`/`MKAIR`/`CUSTOMER`), `allowed_folder_ids` (JSON), `dashboard_folder_ids` (JSON), `hidden_equipment_folder_ids` (JSON), theme prefs, last_login/seen.

**Equipment Registry**
- `equipment_folders` — id, name, description, sort_order, `deadline_preset_id`.
- `equipment_groups` — id, `folder_id`, name.
- `equipment` — id, `folder_id`, `group_id`, `object_name`, `equipment_type` (`SI`/`ESI`/`IO`/`VO`/`OTHER`), name, modification, `serial_number`, `manufacture_year`, `measurement_range_start/end`, `measurement_unit`, status, `current_location_manual`, `compliance_date`, `compliance_interval_months`, `manual_verification_interval_months`, `created_manually`, `exclude_from_arshin_refresh`.

**Arshin / Certificate Data**
- `si_verifications` — 1:1 with `equipment` (SI). Stores `vri_id`, certificate numbers, valid dates, `raw_payload_json`, `detail_payload_json`.
- `equipment_esi_composition_entries` — 1:N with `equipment` (ESI). `module_kind` (`INTERNAL`/`EXTERNAL`), `vri_id`, `measurement_limit`, `sort_order`, certificate fields.

**Repairs**
- `repairs` — `equipment_id`, `batch_key`/`batch_name`, `is_on_site`, `route_city`/`destination`, milestone dates, `deadline_preset_snapshot_json`, `custom_stages_json`, `closed_at`.
- `repair_messages` — `repair_id`, author, text, `is_private`, `batch_key`.
- `repair_message_attachments` — message-level file attachments.

**Verifications** — mirror repairs schema (`verifications`, `verification_messages`, `verification_message_attachments`).

**Comments & Attachments**
- `equipment_comments` — `equipment_id`, author, text, `is_private`.
- `equipment_comment_attachments` — comment-level files.
- `equipment_attachments` — direct equipment-level files.

**Subscriptions**
- `equipment_process_subscriptions` — (`equipment_id`, `user_id`) unique.
- `folder_process_subscriptions` — (`folder_id`, `user_id`) unique.

**Event Journal**
- `event_logs` — category (`EQUIPMENT`/`REPAIR`/`VERIFICATION`), action, title, description, user/equipment/folder denormalized fields, `batch_key`, `event_date`.

**Folder Refresh (metroSearch integration)**
- `equipment_folder_refresh_tasks` — `folder_id`, status (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`), progress, counters, `summary_json`.
- `equipment_folder_refresh_rows` — `task_id`, `equipment_id`, `composition_entry_id`, `target_kind`, `module_kind`, current vs matched certificate data, status (`UPDATED`/`UPDATED_UNCERTAIN`/`UNCHANGED`/`NOT_FOUND`/`ERROR`), uncertainty flags.

**Deadlines**
- `deadline_presets` — code (unique), name, repair total days, stage template JSON.

---

## 7. Auth & Authorization

- **Mechanism**: HMAC-based access tokens (`security.py`) with base64url encoding, 12-hour TTL. `HTTPBearer` dependency.
- **Passwords**: PBKDF2-SHA256, 600k iterations.
- **Role guards**: `require_admin` (ADMINISTRATOR+), `require_operator` (MKAIR+).
- **Folder scoping**: `MKAIR`/`CUSTOMER` are restricted to `allowed_folder_ids`. All list/detail endpoints filter by accessible folders.
- **Soft denial**: requesting a folder outside allowed set returns 404 (not 403) to avoid leaking existence.

---

## 8. Arshin Integration

**Base URL**: `https://fgis.gost.ru/fundmetrology/eapi`

**Endpoints used:**
| Path | Purpose |
|------|---------|
| `GET /vri?rows=...&start=...` | SI list search |
| `GET /mieta?rows=...&start=...` | ESI list search (fast path) |
| `GET /vri/{vri_id}` | Detail fetch (SI + ESI modules) |

**Flows:**
- **SI onboarding**: search `vri` by certificate/registry/org params → select result → fetch `vri/{id}` detail → create `Equipment` + `SIVerification`.
- **ESI onboarding**: search `mieta` by certificate number (fast) → fallback to `vri` search by certificate → select result → fetch `vri/{id}` detail → create `Equipment` + internal modules auto-synced from Arshin.
- **ESI composition**: internal modules are read-only (synced from Arshin); external modules are manually added/edited/deleted via API.
- **Folder refresh**: two-stage matching (`folder_refresh_matcher.py`):
  1. Stage 1: lookup by `result_docnum` (certificate) + year.
  2. Stage 2: if no newer cert, search by instrument params (`mit_number`, `mi_number`) with optional relaxation of `modification`/`notation`.
  - Results in `UPDATED`, `UPDATED_UNCERTAIN`, `UNCHANGED`, `NOT_FOUND`, `ERROR`.

**Public URLs:**
- SI: `https://fgis.gost.ru/fundmetrology/cm/results/{vri_id}`
- ESI: `https://fgis.gost.ru/fundmetrology/cm/etalons/{public_id}` (derived from `rmieta_id`, `id`, or numeric tail)

---

## 9. Key Business Flows

### Equipment CRUD
- Create: choose type (`SI`/`ESI`/`OTHER` etc.). For `SI`/`ESI`, Arshin-backed creation is the intended path; manual plain creation exists for edge cases.
- Update: limited type transitions allowed (e.g. `OTHER` → `SI`/`IO`/`VO`). Backend validation enforces measurement fields per type.
- Delete: single or batch. Cascades repairs, verifications, comments, attachments.

### Repairs / Verifications
- **Grouped (batch)**: shared `batch_key` + `batch_name`, shared dialog history, batch milestone editing.
- **Milestones**: predefined stages per `deadline_preset` + optional custom stages (`custom_stages_json`).
- **Auto-save**: frontend uses `useQueuedAutoSave` for debounced milestone mutations.
- **Messages**: attachments, `@mentions`, private notes (`is_private`). Deletable by author or admin.
- **Close**: sets `closed_at`, moves to archive tab.

### Folder Refresh (metroSearch)
1. User triggers `POST /folders/{id}/refresh` → creates `EquipmentFolderRefreshTask` (status `PENDING`).
2. Async processing builds targets:
   - SI equipment → 1 target row.
   - ESI equipment → 1 root target + 1 per internal module + 1 per external module.
3. Two-stage matching against Arshin.
4. Preview rows persisted in `equipment_folder_refresh_rows`.
5. User reviews table → selects rows → `POST .../apply` updates `SIVerification` or ESI composition entries selectively.

---

## 10. Checks & Testing

```bash
# Full local check
npm run check

# Backend only
npm run lint:backend
npm run test:backend

# Frontend only
npm run lint:frontend
npm run test:frontend
npm run build:frontend
```

---

## 11. Deployment & Backup

**Prod host**: `mkair-server-tmn` (Netbird `100.89.18.223`), `~/apps/metroLog`. Деплой — через GHCR-пайплайн (см. раздел 5):
`main` → Stage, `release/*` → Prod, `promote.yml` → promote/rollback.

**Backups** (GHCR-пайплайн, `~/.backups/`):
- `metroLog_db_<ts>.sql` — `pg_dump` прод-БД (при deploy-prod и promote)
- `metrolog_env_prod_<ts>.bak`, `metrolog_env_stg_<ts>.bak` — `.env` перед `git reset --hard`
- Старый скрипт `scripts/docker/backup.sh` (`backups/YYYYMMDD-HHMMSS/`: `postgres.sql.gz`, `backend-storage.tar.gz`, `redis-dump.rdb`, `compose-ps.txt`, `manifest.txt`) — для ручных бэкапов.

**Manual fallback (pull-based):**
```bash
ssh mkair-server-tmn
cd ~/apps/metroLog
git fetch origin && git reset --hard origin/<branch>
# Stage:
POSTGRES_STG_PORT=5439 IMAGE_TAG=staging docker compose -p metrolog-stg -f docker-compose.staging.yml pull
POSTGRES_STG_PORT=5439 IMAGE_TAG=staging docker compose -p metrolog-stg -f docker-compose.staging.yml up -d
# Prod:
IMAGE_TAG=latest docker compose pull && IMAGE_TAG=latest docker compose up -d
```

**Data safety**: `pull && up -d` сохраняет named volumes. Опасно: `docker compose down -v`.

### Два compose-проекта на сервере (одинаковая папка `~/apps/metroLog`!)
| Проект | Файл | Контейнеры | Порты |
|--------|------|-----------|-------|
| `metrolog` (прод, дефолтный) | `docker-compose.yml` | `metrolog-*` | backend 8000, frontend 5173, postgres 5432, redis 6379 |
| `metrolog-stg` (Stage) | `docker-compose.staging.yml` | `metroLog_*_stg` | backend 9000, frontend 9173, postgres 5439, redis 6380 |

Project name по умолчанию = basename папки (`metroLog` → `metrolog`) — **совпадает с продом**. Поэтому Stage **обязательно** деплоить с явным `-p metrolog-stg` (так делает и `ci.yml`).

**⚠️ КРИТИЧНЫЕ ГРАБЛИ (инцидент 2026-09-24):**
- `docker compose -f docker-compose.staging.yml up -d` **без `-p metrolog-stg`** → compose считает прод-контейнеры `metrolog-*` своими и пересоздаёт их по стейджинг-конфигу → прод-postgres/redis уходят в Created/Dead, прод падает. Данные НЕ теряются (volumes прод-проекта `metrolog_postgres_data` и т.д. не трогаются).
- Восстановление прода: `cd ~/apps/metroLog && docker compose up -d postgres redis` (прод compose, без `-p`).

**Примечания**: `POSTGRES_STG_PORT=5439` обязателен (дефолт 5436 занят `metroCheck_postgres_stg`); Stage БД изолирована (контейнер `metroLog_postgres_stg`, volume `metrolog-stg_postgres_data_stg`); `alembic upgrade head` выполняется при старте backend. Stage фронт: `http://100.89.18.223:9173`.

**Траблшутинг runner'а**: если `ci.yml` не забирает код — на `mkair-server-tmn` проверить `~/.ssh/config`: `Host github.com` должен указывать `IdentityFile` на существующий ключ (рабочий — `~/.ssh/id_ed25519`), иначе `git fetch` в job'ах падает с `no such identity`.

**Runner молча отваливается (silent disconnect)**: юнит `actions.runner.mflkee-metroLog.mkair-runner.service` может оставаться `active`, но потерять сессию с GitHub (в `_diag/Runner_*.log` видно `broker.actions.githubusercontent.com/message ... timed out`, дальше только auth-попытки и никакого `Listening for Jobs`). Тогда `deploy-staging`/`deploy-prod` не запускаются, а run падает с «крестиком» без причины. Лечится:
- автоматически — **watchdog**: `runner-watchdog.timer` (каждые 5 мин) запускает `/usr/local/lib/metroLog/runner-watchdog.sh`, который по GitHub runners API определяет `offline`/`busy` и сам рестартит раннер (2 подтверждения + cooldown 10 мин). Конфиг — `/etc/metroLog/runner-watchdog.env` (`0600`): `GITHUB_TOKEN` (fine-grained PAT, **Administration: read**) + `REPO`/`RUNNER_NAME`/`RUNNER_SERVICE`;
- вручную — `sudo systemctl restart actions.runner.mflkee-metroLog.mkair-runner.service` и убедиться, что в логе появилось `Listening for Jobs`;
- установка на новом хосте — `sudo scripts/server/setup-runner-watchdog.sh` (ставит скрипт, юниты, `Restart=always` drop-in, включает таймер).
- в `ci.yml` есть джоб `runner-preflight` (GitHub-hosted), ждёт online-раннер до ~10 мин и падает с явным сообщением; требует repo-secret `RUNNER_STATUS_TOKEN` (тот же scope), без него — только warning.

**Алгоритм выкатки фичи:**
1. `feature/*`-ветка → локальные проверки (`npm run check`).
2. Merge в `main` (push) → CI соберёт `:staging` и обновит Stage (на прод не влияет). Тест на Stage.
3. Прод: `git push origin main:release/<name>` (соберёт `:latest`) **или** `gh workflow run promote.yml -f tag=staging` (тот же образ, что тестировали на Stage).
4. Проверить: health `:8000` + `docker compose ps`. Откат — `promote.yml` с `tag=sha-<hash>`.

---

## 12. Current Hotspots

- Folder refresh review UX: filtering, bulk selection, excluding rows from future scans.
- Repair/verification queue SQL: needs deeper scoping + bounded query shapes.
- DB pool sizing, timeout tuning, structured observability — pending.
- Attachment previews: currently fetch originals; thumbnails are planned.
- Load validation for ~100 concurrent active users — pending.
