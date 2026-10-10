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
- **Frontend**: React + Vite + TanStack Query + Zustand (auth, theme) + Tailwind CSS **v4** (plugin `@tailwindcss/vite`, JS config через `@config`) with a bespoke design system (shadcn/`metro-ui` pilot in progress).
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
| `app/services/equipment_service.py` | Main domain service: registry, repairs, verifications, comments, attachments, exports, batch flows, folder refresh. Being split into mixins (see `refactor-hotspots`). |
| `app/services/equipment_process_templates.py` | Process stage templates and repair-deadline presets, extracted from the main service (helpers + `EquipmentProcessTemplatesMixin`). |
| `app/services/equipment_folders.py` | Folder and group API plus folder-access helpers, extracted from the main service (`EquipmentFoldersMixin`). |
| `app/services/equipment_comments.py` | Comments, equipment attachments and the attachment/image storage pipeline, extracted from the main service (`EquipmentCommentsMixin`). |
| `app/services/equipment_repairs.py` | Repair processes: queue, batches, milestones, messages and archives, extracted from the main service (`EquipmentRepairsMixin`). |
| `app/services/equipment_verifications.py` | Verification processes: queue, batches, milestones, messages, Arshin refresh and archives, extracted from the main service (`EquipmentVerificationsMixin`). |
| `app/services/equipment_exports.py` | Excel import/export and certificate parsing, extracted from the main service (`EquipmentExportsMixin`). |
| `app/services/equipment_folder_refresh.py` | Folder-level Arshin rescan (tasks, matching, apply), extracted from the main service (`EquipmentFolderRefreshMixin`). |
| `app/services/equipment_text.py` | Small text helpers shared by the equipment service mixins. |
| `app/services/user_service.py` | Auth, bootstrap admin, roles, folder access. |
| `app/services/event_service.py` | Audit journal. |
| `app/services/arshin_service.py` | Arshin search and detail fetch. |
| `app/services/folder_refresh_matcher.py` | Two-stage Arshin matcher for folder refresh. |
| `app/services/notification_service.py` | SMTP email dispatch. |
| `app/services/task_service.py` | Tasks: creation (folder derived from equipment), participants, checklist, messages, attachments, subscriptions, reminders, permissions (`_can_mutate`, `_assert_task_visible`). |
| `app/repositories/task_repository.py` | Task queries: list filters (folder scope plus the folder-less tasks of the viewer) and ordering. |
| `app/models/task.py` | Task ORM models (task, participants, equipment links, checklist, messages, attachments, subscriptions, reminder log). |
| `app/schemas/task.py` | Task request/response schemas. |
| `app/api/v1/routes/tasks.py` | Task HTTP surface: list/detail, participants, equipment, checklist, messages, attachments, subscription. |
| `app/tasks/worker.py` | RQ worker bootstrap. |
| `app/tasks/notifications.py` | Enqueued email jobs. |
| `app/integrations/arshin_client.py` | HTTP client for FGIS Arshin API. |
| `app/api/v1/routes/equipment.py` | Main HTTP surface: folders, equipment, repairs, verifications, attachments, comments, exports, imports, refresh. |
| `app/api/v1/routes/auth.py` | Login, me, change password. |
| `app/api/v1/routes/users.py` | User CRUD, role management. |
| `app/api/v1/routes/events.py` | Event journal. |
| `app/api/v1/routes/arshin.py` | Arshin proxy endpoints. |
| `app/api/v1/routes/health.py` | Liveness + readiness (DB + Redis). |
| `alembic/versions/` | 61 migrations. |

### Frontend (`frontend/`)
| File | Purpose |
|------|---------|
| `src/app/router.tsx` | Browser router, lazy-loaded pages, guards. |
| `src/app/ShellLayout.tsx` | Auth shell with sidebar + topbar. |
| `src/app/RouteGuards.tsx` | `RequireAuth`, `RequireGuest`, `RequireRoles`. |
| `src/store/auth.ts` | Zustand auth store (token in localStorage). |
| `src/store/theme.ts` | Zustand theme store (10 themes, `data-theme` attr). |
| `src/api/client.ts` | Thin `fetch` wrapper, `ApiError`, bearer injection. |
| `src/api/equipment.ts` | Barrel re-exporting the split domain API modules below, so existing imports keep working. |
| `src/api/equipment/` | Domain API modules: `registry`, `folders`, `repairs`, `verifications`, `comments`, `esi`, `refresh`, `exports`. |
| `src/api/arshin.ts` | Arshin search, detail, status probe. |
| `src/pages/DashboardPage.tsx` | Folder-scoped dashboard widgets, rendered from the user's saved arrangement (order, width preset, collapsed). |
| `src/components/dashboard/DashboardWidgetGrid.tsx` | The dashboard grid: arranged modules in order, each in its width preset; live reorder with a dashed landing slot and a floating copy. |
| `src/components/dashboard/DashboardWidgetCell.tsx` | One grid cell: the module card, or the dashed placeholder while that module is being dragged. |
| `src/components/dashboard/DashboardWidgetShell.tsx` | One dashboard module: title row, width presets, collapse control, body. |
| `src/lib/useDragReorder.ts` | Live drag-to-reorder: order changes while dragging, saved once on drop, click after drop suppressed. |
| `src/lib/useFlipAnimation.ts` | FLIP glide for items whose grid slot changed. |
| `src/lib/sortableOrder.ts` | Pure drop-slot resolution (`resolveInsertionSlot`, `moveItemToSlot`) and rect measuring. |
| `src/hooks/useIsWideScreen.ts` | True on the `xl` viewport; gates dashboard dragging. |
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
| `src/components/equipment-details/SiSections.tsx` | SI presentation sections for the equipment card. |
| `src/components/equipment-details/EsiSections.tsx` | ESI composition sections for the equipment card. |
| `src/lib/equipmentDetails.ts` | Pure formatting/parsing helpers for the equipment card. |
| `src/hooks/useEquipmentDetailsQueries.ts` | Read-only queries of the equipment card (equipment, folders, presets, suggestions, mentions, share recipients, process messages). |
| `src/hooks/useEquipmentComments.ts` | Equipment-card discussion slice: composer state, draft-upload refs, comment mutations. |
| `src/hooks/useEquipmentAttachments.ts` | Equipment-card attachment slice: upload/delete mutations and composer bookkeeping. |
| `src/hooks/useProcessMessages.ts` | Repair and verification discussion slices: drafts, refs and the six message mutations. |
| `src/hooks/useEquipmentShare.ts` | Share-link modal state and mutation. |
| `src/hooks/useEquipmentArshinEsi.ts` | Arshin SI-refresh and ESI-composition tooling (state, mutations, modal helpers). |
| `src/hooks/useEquipmentProcessActions.ts` | Create-repair/verification, delete and Arshin-exclusion actions. |
| `src/hooks/useEquipmentRegistryQueries.ts` | Registry page queries (folders, presets, page, selection, suggestions, refresh task, mentions). |
| `src/hooks/useFolderRefresh.ts` | Folder rescan state and mutations of the registry page (tracked task lives in `src/store/folderRefresh.ts`). |
| `src/pages/TasksPage.tsx` | Task board and list with filters, plus the create dialog whose equipment step is `EquipmentPicker`. |
| `src/pages/TaskDetailsPage.tsx` | Task card: status, priority, due date, participants, equipment, checklist, discussion, attachments, subscription. |
| `src/components/EquipmentPicker.tsx` | Equipment picker body: folder → filters → ticked rows → `Добавить`; rendered inside the task dialog and by `EquipmentPickerModal`. |
| `src/components/EquipmentPickerModal.tsx` | The picker in a dialog of its own (task card). |
| `src/components/TaskParticipantsModal.tsx` | Responsible/assignees/observers editor of the task card. |
| `src/store/folderRefresh.ts` | Folder-rescan tracking that outlives the registry page (task, folder, minimised, modal open). |
| `src/components/FolderRefreshDock.tsx` | Shell-level panel that keeps reporting a running rescan in any section. |
| `src/hooks/useFolderActions.ts` | Folder CRUD and folder-subscription actions. |
| `src/hooks/useSiImportExport.ts` | Arshin SI import/export slice of the registry page. |
| `src/components/equipment-registry/EquipmentTable.tsx` | Registry table row and sortable header. |
| `src/lib/equipmentRegistry.ts` | Registry page types, defaults and pure helpers. |
| `src/lib/equipmentQueries.ts` | Shared registry query invalidation helper. |
| `src/components/ui/*` | **shadcn/metro-ui pilot** (`badge`, `card`, `button`, `dialog` from `@shadcn`; `status-badge`, `stat-card`, `page-header` from `metro-ui`) + `app-dialog.tsx` (our shell over the Radix dialog, dismissal contract) and `src/lib/utils.ts` (`cn`). |
| `src/components/ui/searchable-select.tsx` | Searchable single/multi select (chips, keyboard, results cap, optional history + server-side query) used by the task participants and equipment pickers. |
| `src/components/ui/select.tsx` | The app's own single-choice list (no native `<select>` anywhere): `.select-trigger` + the shared floating menu, keyboard and ARIA included. |
| `src/lib/searchHistory.ts` | Recent-query history per search box (localStorage, capped, deduped). |
| `src/lib/taskBoard.ts` | Board drop decision (`resolveBoardDrop`), used by the task board and unit-tested. |
| `src/components/ProcessStageInlineControls.tsx` | Milestone date editing + custom stages. |
| `src/lib/milestoneValidation.ts` | Milestone order validation rules. |
| `src/lib/processVariants.ts` | Repair/verification preset variant helpers. |
| `src/lib/processStages.ts` | Shared process-stage helpers for the repair and verification queues (custom stages, ordering, progress label). |
| `src/lib/esiModules.ts` | ESI module extraction helpers. |
| `src/lib/useQueuedAutoSave.ts` | Debounced mutation queue for auto-save UX. |
| `src/content/user-guide.ru.txt` | Raw help text for `HelpPage`. |

> ⚠️ **Грабли сборки фронта**: файлы **вне** `frontend/` (например корневой `CHANGELOG.md`, который импортит «Что нового»), нужно явно копировать в `frontend/Dockerfile`. Иначе локальная `vite build` проходит (файл есть в дереве), а docker-сборка в CI падает на `Build & push frontend`.

> ⚠️ **Tailwind v4** (миграция 2026-10-08, change `tailwind-v4-upgrade`): фронт на **Tailwind v4** через плагин `@tailwindcss/vite`; `postcss`/`autoprefixer` убраны, `postcss.config.cjs` удалён (и вычищен из `frontend/Dockerfile`). Точка входа — `@import "tailwindcss"` + `@config "../../tailwind.config.ts"`, так что кастомные цвета (`ink`/`mist`/`steel`/`line`/`signal.*`), `shadow-panel` и шрифт по-прежнему живут в `tailwind.config.ts` (не переносить в CSS-first `@theme` без причины). Кастомные классы в `styles.css` **намеренно не обёрнуты в `@layer`**: в v4 unlayered CSS бьёт любые layered-утилиты — как в v3 «наши классы после `@tailwind utilities`». В `@layer base` восстановлены две v4-нормы, на которые опирается UI: дефолтный `border-color` из `--border-color` и `cursor: pointer` у активных кнопок. Переименования v4 к запоминанию: `bg-gradient-to-*`→`bg-linear-*`, `backdrop-blur`→`backdrop-blur-sm`, `backdrop-blur-sm`→`backdrop-blur-xs`, `outline-none`→`outline-hidden`, `shadow-sm`→`shadow-xs`; дефолт `border`/`ring` в v4 — `currentColor`. v4 требует современных браузеров (CSS cascade layers).

> 🧪 **UI-пилот shadcn/`metro-ui`** (change `shadcn-ui-pilot`, 11/15): адоптированные примитивы — в `src/components/ui/` (`badge`/`card`/`button`/`dialog` из реестра `@shadcn`; `status-badge`/`stat-card`/`page-header` из реестра `@metro` = `mflkee/metro-ui`), `app-dialog.tsx` — наша оболочка над Radix-диалогом, `src/lib/utils.ts` — `cn`. Переменные shadcn смаплены на **наши токены** в `@theme inline` (напр. `--color-primary: var(--button-primary-bg)`, `--color-card: var(--panel-bg)`, `--color-destructive: var(--danger)`), а `dark:` привязан к `.dark` и потому неактивен — темы остаются только через `data-theme` (10 тем). **Контракт диалога:** клик по фону НЕ закрывает, закрывают только явная кнопка и Escape (покрыто тестом `app-dialog.test.tsx`). Пилот ограничен страницами задач; своя шапка (`src/components/layout/PageHeader.tsx`) и своя модалка (`src/components/Modal.tsx`) остаются для остальных страниц. `dropdown-menu` отложен: единственный рукописный дропдаун (`EmojiPickerButton`) — общий (19 вызовов на 5 страницах), это уже не пилотный объём.

> ⚠️ **Грабля: bespoke-класс перебивает Tailwind-утилиту.** Наши классы в `styles.css` не в `@layer` (см. заметку про v4 выше), поэтому **любой** наш класс бьёт утилиту на том же элементе — включая `lg:hidden` и `lg:sticky`. Поймали дважды: `.mobile-nav-toggle { display: inline-flex }` не давал `lg:hidden` скрыть кнопку на десктопе (брейкпоинт переехал в CSS), а `.sidebar-shell { position: relative }` не давал `lg:sticky` прилипать (разделитель стал бордером). **Правило:** если на элементе есть наш класс, не полагайся на утилиту для того же свойства — либо убери свойство из класса, либо задай брейкпоинт в CSS.

> 🧭 **UI-конвенции** (change `ui-polish-batch`, код готов, остались Stage-проверки владельца):
> - **Drag & drop** — `@dnd-kit`, но **без** `SortableContext` и стратегий сортировки. Доска задач: карточка едет **сама** (свой `transform`), целевая колонка подсвечивается пунктирным слотом, статус применяется **оптимистично** и карточка встаёт сразу при отпускании (логика дропа — `src/lib/taskBoard.ts`). Перестановка списков (модули главной, папки, карточки внутри колонки доски задач) — общий движок `src/lib/useDragReorder.ts`: **живая** перестановка (порядок меняется прямо во время перетаскивания, соседи реально расступаются), плавность — FLIP (`src/lib/useFlipAnimation.ts`), dragged-элемент рисует `DragOverlay` с `dropAnimation={null}`, а его ячейка остаётся пунктирным плейсхолдером того же размера. Позиции для ответа «куда встанет» измеряются **один раз на старте** драга (`measureDragRects` + `resolveInsertionSlot`/`moveItemToSlot` в `src/lib/sortableOrder.ts`), поэтому решение зависит только от указателя и не дёргается, пока элементы едут. `subsetOf` сужает перестановку до подмножества (колонка доски), а `applySubsetOrder` возвращает новый порядок подмножества в общий список. Клавиатура: стрелки на ручке (модули главной), Alt+стрелки (папки, карточки доски).
> - ⚠️ **Грабля dnd-kit: `rectSortingStrategy` нельзя применять к элементам разного размера.** Она считает сдвиг как `arrayMove` по прямоугольникам и возвращает `scaleX = newRect.width / oldRect.width` (то же по высоте). Со `scale` dragged-элемент растягивался/сужался под чужой слот (модуль менял ширину, проходя мимо модуля другой ширины; короткая карточка папки раздувалась до высоты высокой), а без `scale` (через `CSS.Translate`) он доезжал не до конца, освобождал лишнее место и всё прыгало на дропе. Поэтому перестановка идёт через реальный порядок в разметке + FLIP, а не через трансформы стратегии.
> - ⚠️ **Клик после дропа.** dnd-kit не гасит `click`, который браузер шлёт после перетаскивания: карточка, открывающаяся по клику, после дропа на том же месте открывалась. Гасим: `useDragReorder().shouldSuppressClick(key)` (папки) и `onClickCapture` в `DraggableTaskCard` (доска задач).
> - **Выпадающие списки — только наши.** Нативный `<select>` открывает попап средствами ОС (в Linux — GTK-меню), и он выбивается из интерфейса, поэтому нативных селектов в коде быть не должно: выбор из списка — `src/components/ui/select.tsx` (`Select`), поиск по списку — `SearchableSelect`. Триггер стилизуется классом `.select-trigger` (зеркало `.form-input`, включая `margin-top: 8px` и вариант `--compact`), список рисует `FloatingAutocompleteMenu` (портал в диалог, если поле внутри модалки). Клавиатура: стрелки, Enter/Space, Escape, Home/End.
> - **Состояние — это фон, а не бордер** (owner request, change `light-theme-state-and-density`): наведение, выбор и активная вкладка показываются **сменой фона**, а не цвета бордера — как на гитхабе. В покое у контрола/карточки/бейджа свой бордер (это их «хром»), но ни `:hover`, ни выбранное состояние его не перекрашивают. Клавиатурный фокус — единственное кольцо, которое рисует приложение: `outline: 2px solid var(--accent)` из `@layer base` (`:where(...)` — нулевая специфичность, поэтому shadcn-компоненты со своим `focus-visible:ring` его перебивают и двойного кольца нет). Следствия: `.nav-icon-badge` без бордера и фона (иконка — просто иконка, фон даёт строка меню), у выбранных чипов/вкладок/строк акцентный фон без акцентного бордера, `hover:border-*` в коде больше нет вообще. Правило стережёт тест `src/lib/uiConventions.test.ts` (читает исходники: `hover:border-*` и `border-[color:var(--accent)]` запрещены).
> - **Светлая тема: порог контраста** (`light-theme-state-and-density`). 1px-линия антиалиасится на две строки пикселей, когда не попадает на границу device-pixel (зум, дробный DPR), и контраст решает, читается это линией или рябью. Поэтому в светлой теме бордеры заметно темнее «гитхабовских»: `--border-color: #a9b6c4` (**2.06** на белом; `#d0d7de` — всего 1.5) для карточек и разделителей, `--border-strong: #8494a5` (**3.11**) для контролов и полей, `--text-muted: #4c5866` (**7.25** на белом / 6.0 на холсте — вторичный текст был 5.8 и «серое по белому»). Холст `#e6eaf1` и белые панели не менялись. Пороги стережёт тот же тест (считает WCAG-контраст прямо из токенов `:root`).
> - **Цвета диаграмм и статусов.** Палитра `--chart-*` различает секции **и по тону, и по светлоте** (`oklch`): одинаковые по светлоте синий и бирюзовый на тёмной панели сливаются — на это и жаловались. Цвета, которые читаются как текст (`--danger`/`--warning`/`--info`), обязаны держать WCAG AA (≥4.5) на панели своей темы: в светлой теме они были 3.0–4.1 и их пришлось затемнить.
> - **Раскладка главной** — модули главной пользователь раскладывает сам: порядок, ширина (`1/3`/`1/2`/`1/1`) и сворачивание, всё **per-user** в `users.dashboard_layout` (миграция 0057, `PATCH /auth/me`). Правится в режиме `Настроить раскладку` на самой главной; вне режима модуль выглядит как раньше, а контент кликабелен. Перетаскивание — живая перестановка с пунктирным плейсхолдером (см. выше), порядок сохраняется один раз, на дропе. Дефолт (`defaultDashboardLayout`) — ровная укладка сетки без дырок: `full, full, half+half, half+half, half+half, full` (две карточки распределений были по `1/3` и оставляли пустую треть ряда, поэтому стали `1/2`); его получает каждый, у кого раскладка не сохранена, и он же возвращается кнопкой сброса. Видимость модулей остаётся в настройках, и выключенный модуль хранит своё место. Сворачивание — чисто визуальное (данные продолжают грузиться), ниже `xl` модули идут одной колонкой и перетаскивания нет. Правила нормализации хранимой раскладки — `src/lib/dashboard.ts` (`normalizeDashboardLayout`), порядок видимых модулей внутри полной раскладки — `applyVisibleOrder`; тесты — `dashboard.test.ts`, `sortableOrder.test.ts` и `src/components/dashboard/*.test.tsx`.
> - **Плотность модуля — от его ширины, а не от вьюпорта** (`light-theme-state-and-density`). `renderWidgetBody(key, size)` уже получает пресет ширины, и решение принимается по нему, а не по `sm:`/`lg:` — иначе модуль `1/3` на широком экране вываливал бы всё содержимое в треть ряда. Лестница: `1/3` — опознавание + один факт (у задач: название, статус, срок; у списков — строка без второстепенных полей; у парных карточек — одна колонка; у пончика — легенда под диаграммой и кольцо меньше), `1/2` — плюс приоритет и папка (и следующие поля списков), `1/1` — всё, что есть. Помощники — `dashboardWidgetRowLimit`, `dashboardPairColumnsClass`, `dashboardDonutLayoutClass`, `isCondensedWidget` в `src/lib/dashboard.ts`.
> - **На 1/1 задачи — таблица, а не карточки** (owner request: «много пустого места по середине»). Карточка на всю ширину оставляла пустоту между названием слева и сроком справа, поэтому модуль задач на `1/1` рисует **ту же таблицу, что список задач** (`src/lib/taskTable.ts`: те же 7 колонок в том же порядке, статус — `StatusBadge`), и она **компактнее** карточек (одна строка на задачу вместо трёх), показывая при этом больше. Колонки появляются по мере роста **самого модуля** — container queries: на теле модуля стоит `@container` (`DashboardWidgetShell`), шаги `@xl` (36rem) и `@5xl` (64rem) добавляют папку/приоритет, затем ответственного/приборы. ⚠️ Шаблон строки (`grid-cols-[…]` на каждый шаг) и видимость колонок (`hidden @xl:block`) — **две половины одного контракта**, и обе записаны литералами: Tailwind читает исходный текст, класс, собранный в рантайме, не генерируется (проверено: без литералов `@container (min-width:…)` в CSS не появляется). Рассинхрон ловится тестом `src/lib/taskTable.test.ts` (сравнивает число треков и число видимых колонок на каждом шаге).
> - **Дефолт — «включено всё»** (`light-theme-state-and-density`). Виджеты главной и темы интерфейса по умолчанию **все**: `defaultVisibleThemes` = весь каталог тем, `defaultDashboardWidgets` = весь каталог виджетов, а хранимый `null` означает «дефолт». Поэтому миграция `0060` обнуляет `users.dashboard_widget_options` и `users.enabled_theme_options` у всех: новый виджет или новая тема появляются у всех без новой миграции, а в настройках все переключатели включены. `theme_preference` (какая тема сейчас) миграция не трогает — это не список, а выбор.
> - **Контролы**: булевы настройки и toggle-фильтры — shadcn `Switch` (`src/components/ui/switch.tsx`), ярлык через `htmlFor`/`id`. **Чекбоксы остаются** только для выбора из списка (выделение строк в таблицах, массовые действия, выбор получателей) — у `Switch` нет indeterminate, это другой контроль. Чек-листы задач тоже на `Switch`, с локальным оптимистичным тиком, чтобы реагировали мгновенно.
> - **Даты**: всё отображается как `dd.mm.yyyy` через `src/lib/dates.ts` (`formatDateRu`/`formatDateTimeRu`); дата-only ISO читается как календарная, чтобы день не сдвигался. Нативный `<input type="date">` не использовать (формат по локали браузера) — брать `DateInput`.
> - **Поп-апы**: любые выпадающие списки рендерить через `FloatingAutocompleteMenu` (`position: fixed`), иначе модалка их обрежет; поверхность — общий класс `.autocomplete-input__menu`, свой бордер/фон не добавлять. Список **всегда раскрывается вниз** от поля (подгоняет высоту по месту, а при нехватке места подтягивается вверх, но не переворачивается над полем — иначе закрывает то, что набираешь). **Внутри модалки список порталится в сам диалог, а не в `body`**: Radix ставит `body { pointer-events: none }` (лечится `pointer-events: auto`) и глобальный непассивный `wheel`-слушатель, который глушит прокрутку всего, что вне диалога — поэтому список в `body` не прокручивается колесом. По той же причине у модалок не должно быть своего `overflow`, иначе они режут портальный список.

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
1. `checks` — гейт на GitHub-hosted: `ruff check`, `pytest` (с coverage-отчётом), `eslint`,
   `vitest --run` (фронт-тесты). Деплой не стартует, если проверки красные.
2. `build-images` — `actions/checkout`, login GHCR, buildx, build & push backend + frontend (cache `type=gha`).
3. `deploy-staging` (только `main`, `needs: [checks, build-images, runner-preflight]`) — `git reset --hard origin/main` в `~/apps/metroLog`,
   `POSTGRES_STG_PORT=5439 IMAGE_TAG=staging docker compose -p metrolog-stg -f docker-compose.staging.yml pull && up -d`,
   health-check `:9000`.
4. `deploy-prod` (только `release/*`, `needs: [checks, build-images, runner-preflight]`) — `git reset --hard origin/<release>`, `pg_dump` в `~/.backups/`,
   `IMAGE_TAG=latest docker compose pull && up -d`, health-check `:8000`.

В `docker-compose*.yml` образы параметризованы: `image: ghcr.io/mflkee/metrolog-backend:${IMAGE_TAG:-latest}`
(аналогично frontend); `build:` остаётся как fallback для локальной сборки.

> ⚠️ **Грабля GitHub Actions: `permissions` на уровне джобы ЗАМЕНЯЕТ верхнеуровневый блок.** Когда в
> `deploy-prod` добавили `permissions: contents: write` (для удаления одноразовой релизной ветки),
> джоба потеряла `packages` из верхнеуровневого `permissions` — и `docker compose pull` из GHCR упал
> с `error from registry: denied`, хотя `docker/login-action` до этого «успешно» залогинился. Прод при
> этом не пострадал: шаг упал на `pull`, до `up -d` дело не дошло. **Правило:** объявляя права джобы,
> перечисляй ВСЕ нужные скоупы (`contents: write` + `packages: read`), а не только новый.

**Monitoring infrastructure** (отдельный compose-проект `~/apps/monitoring`):
- Prometheus (`127.0.0.1:9091`)
- Grafana (`192.168.1.84:8090`)
- Node Exporter, cAdvisor, Alertmanager, Blackbox Exporter

### Версионирование

SemVer `MAJOR.MINOR.PATCH`. **Единый источник** — `version` в
`frontend/package.json` (держи в синхроне с корневым `package.json`). Значение
инжектится в бандл на сборке (`__APP_VERSION__`, см. `vite.config.ts` и
`vitest.config.ts`) и показывается бейджем `vX.Y.Z · beta` в шапке
(`AppVersionBadge`). Пока версия < `1.0.0`, сервис считается бетой — бейдж всегда
несёт канал `beta`.

**Правило (для агента и людей): версия меняется только на релизном шаге, а не в
обычных feature/фикс-коммитах.** Feature-коммиты, ветки и OpenSpec-change'ы версию
не трогают; бамп — отдельным коммитом `chore(release): vX.Y.Z` при выкатке. Это
упрощает диффы и merge-конфликты.

**Политика: SemVer по смыслу + окно релиза** (выбрана владельцем 09.10.2026; до
этого всё подряд уезжало как `PATCH` — 7 из 10 релизов после `0.3.0` несли новые
возможности, и номер перестал что-либо значить):
- `PATCH` (`0.4.0 → 0.4.1`) — **только исправления уже выпущенной версии**; выходят
  сразу, не дожидаясь окна (хотфикс);
- `MINOR` (`0.3.x → 0.4.0`) — всё, что **добавляет возможность или меняет поведение,
  права доступа или модель данных** (миграция — всегда сигнал `MINOR`). Такие
  изменения **копим за цикл** (фидбек владельца на Stage) и выпускаем одним релизом,
  а не по каждому коммиту. До `1.0.0` `MINOR` может включать ломающие изменения —
  это норма pre-1.0 SemVer;
- `MAJOR` (`1.0.0`) — первый стабильный: снимаем `beta`, обещаем совместимость.
  Решает владелец, когда сервис выходит из беты;
- внутри линии `0.4.x` — только `PATCH`; следующая новая возможность — `0.5.0`.

**Гигиена (номера не переиспользуем, теги не перевешиваем):**
- номера строго по порядку; пропущенный релиз помечается в `CHANGELOG.md` (как
  `0.3.2` — «не выпускалась»), а не молчаливой дырой;
- тег `vX.Y.Z` — аннотированный и **только на релизный коммит**
  `chore(release): vX.Y.Z`. Перевешивать тег после релиза нельзя: понадобился фикс
  после тега — это новый `PATCH`. Проверяет workflow `version-guard.yml` (push тега);
- `release/*` — **одноразовая ветка**: от релизного коммита, один push, после
  успешного `deploy-prod` удаляется автоматически (запись о релизе — тег). Старые
  `release/*` не храним: `ci.yml` триггерится на **любой** push в `release/*` и
  делает в проде `git reset --hard origin/<ветка>` + `IMAGE_TAG=latest`, то есть
  живая старая ветка — футган «прод из старого кода со свежим образом»;
- ⚠️ удалять старую `release/*` **только** через `release-branch-cleanup.yml`
  (`workflow_dispatch`): удаление ветки тоже шлёт `push`-событие, и GitHub берёт
  workflow-файл **из самой удаляемой ветки** (то есть старый `ci.yml` без guard'ов),
  а SHA откатывается к дефолтной ветке — локальный `git push --delete` пересоберёт
  `:latest` из чужого кода. Внутри Actions удаление идёт через `GITHUB_TOKEN`, а
  события от него workflow-прогонов не создают, поэтому шаг автоудаления в
  `deploy-prod` безопасен;
- джоба `version-guard` в `ci.yml` — гейт перед деплоем: `frontend/package.json`
  == корневой `package.json`, а для `release/*` — ещё и == имени ветки.

Релизный чеклист (Stage → Prod):
1. собрать всё, что уехало с прошлого релиза (OpenSpec change'ы, коммиты, merge в `main`);
2. определить тип бампа по правилу выше (`MINOR`, если в порции есть новое или изменение поведения);
3. поднять `version` в `frontend/package.json` и в корневом `package.json`;
4. добавить пользовательскую запись в `CHANGELOG.md` (версия + дата + тезисно «что нового»; без внутренних деталей);
5. коммит `chore(release): vX.Y.Z` и аннотированный git-тег `vX.Y.Z` на нём;
6. выкатить на прод: `git push origin main:release/X.Y.Z` (или `gh workflow run promote.yml -f tag=staging`);
7. после успешного прода ветка `release/X.Y.Z` удаляется (это делает CI), тег остаётся записью о релизе.

`CHANGELOG.md` — источник для вкладки «Что нового» в UI.

Текущая линия: `0.3.10` — последняя из «потока» `0.3.x` (он выпускался по каждому
фиксу и новой мелочи). Следующая порция нового собирается как **`0.4.0`** (`MINOR`).

---

## 6. Database Schema (Key Entities)

**Users & Auth**
- ⚠️ **Два разных регистра в одной строке:** `users.theme_preference` — это `Enum(UserThemePreference, native_enum=False)` **без** `values_callable`, поэтому SQLAlchemy пишет **имя** члена (`LIGHT`, `GRAY`, …), а `users.enabled_theme_options` — обычный JSON-список **значений** (`light`, `gray`, …). CHECK-constraint на колонке нет, поэтому запись «не тем» регистром проходит молча, а потом падает при чтении энума. Миграции, переписывающие темы, обязаны писать в `theme_preference` имя (см. `0059_retire_gray_theme.py`).
- ⚠️ **Грабля SQLAlchemy: `None` в JSON-колонку — это JSON `null`, а не SQL NULL.** У типа `JSON` параметр `none_as_null` по умолчанию `False`, поэтому `values(col=None)` пишет литерал `null` — колонка остаётся **не** SQL NULL, и `IS NOT NULL` её по-прежнему находит (миграция 0060 «обнулила» настройки так, что 7 строк удержали JSON `null`; лечится 0061). На чтении разницы нет (JSON `null` декодируется в `None`), но по данным «пусто» и «не пусто» разъезжается. Пиши `sa.JSON(none_as_null=True)` или `sa.null()`, когда нужен настоящий SQL NULL.
- `users` — id, first/last/patronymic, email (unique), password_hash, role (`DEVELOPER`/`ADMINISTRATOR`/`MKAIR`/`CUSTOMER`), `allowed_folder_ids` (JSON), `dashboard_folder_ids` (JSON), `hidden_equipment_folder_ids` (JSON), `dashboard_widget_options` (JSON, which widgets are shown; `null` = all of them), `dashboard_layout` (JSON, ordered `{key, size, collapsed}` entries — order, width preset and collapsed state; `null` = the default arrangement), theme prefs (`enabled_theme_options` — the list offered in the switcher, `null` = every theme; `theme_preference` — the one in use), last_login/seen.

**Equipment Registry**
- `equipment_folders` — id, name, description, sort_order, `deadline_preset_id`.
- `equipment_groups` — id, `folder_id`, name.
- `equipment` — id, `folder_id`, `group_id`, `object_name`, `equipment_type` (`SI`/`ESI`/`IO`/`VO`/`OTHER`), name, modification, `serial_number`, `manufacture_year`, `measurement_range_start/end`, `measurement_unit`, status, `current_location_manual`, `compliance_date`, `compliance_interval_months`, `manual_verification_interval_months`, `created_manually`, `exclude_from_arshin_refresh`.

**Arshin / Certificate Data**
- `si_verifications` — 1:1 with `equipment` (SI). Stores `vri_id`, certificate numbers, valid dates, `raw_payload_json`, `detail_payload_json`.
- `equipment_esi_composition_entries` — 1:N with `equipment` (ESI). `module_kind` (`INTERNAL`/`EXTERNAL`), `vri_id`, `measurement_limit`, `sort_order`, certificate fields.

**Tasks**
- `tasks` — id, `folder_id` (**nullable**: taken from the linked equipment when it lives in one folder), title, description, status, priority, kind, tags, `due_date`, `board_order` (manual place in a board column, **shared** by everybody; `null` = never reordered, so it sorts after the explicitly placed tasks of its column), author, `completed_at`.
- `task_participants` — (`task_id`, `user_id`, role `RESPONSIBLE`/`ASSIGNEE`/`OBSERVER`), unique per role so the responsible may also be an assignee; plus `task_equipment`, `task_checklist_items`, `task_messages` + message attachments, `task_attachments`, `task_subscriptions`, `task_reminder_log`.
- Visibility: the folder scope plus everything the viewer is part of — the author and any participant read their task whatever folder it lives in (an invitation outranks the folder); everybody else stays scoped, and a folder-less task is otherwise operators-only. Mutation is allowed to operators, the author and `RESPONSIBLE`/`ASSIGNEE` (exposed as `can_mutate`).

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

### Tasks
- Creation asks for a title and a responsible; equipment goes through the folder-aware
  `EquipmentPicker` (folder → filters → ticks → `Добавить`). The task's folder is derived from the
  equipment, so a task is folder-less when there is no equipment or it spans folders.
- Access: the folder scope, plus anything the viewer is part of — an invitation outranks the
  folder, so a participant always reads their task; a folder-less task is otherwise operators-only. Mutations are for operators, the author and `RESPONSIBLE`/`ASSIGNEE`
  (the payload carries `can_mutate`, which is what the screens hide controls with).
- Board order is **shared**: the column is a team queue, so `tasks.board_order` belongs to the task,
  not to a user. The board asks for `sort=board` (explicitly placed tasks first, then the default
  order, so a new task lands at the end of its column) and reordering is an operator action
  (`POST /tasks/board/reorder` with the column's ids top-to-bottom; the tasks must share a column
  and be visible to the caller). A task that changes column loses its old place and joins the new
  column unordered. Dragging inside a column is the same live-reorder engine as the dashboard and
  the folder list, scoped to the column (`subsetOf` in `useDragReorder`).

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
- автоматически — **watchdog**: `runner-watchdog.timer` (каждые 5 мин) запускает `/usr/local/lib/metroLog/runner-watchdog.sh`, который по GitHub runners API для каждой цели определяет `offline`/`busy` и сам рестартит раннер (2 подтверждения + cooldown 10 мин). Покрывает **все раннеры хоста** (`metroLog`, `metroCheck`, `metroGen`): список в `TARGETS` («`<repo> <runner> <service>`» построчно). Конфиг — `/etc/metroLog/runner-watchdog.env` (`0600`): `GITHUB_TOKEN` (PAT с доступом к runners всех целевых репо; лучше fine-grained, **Administration: read**) + `TARGETS`;
- вручную — `sudo systemctl restart actions.runner.mflkee-metroLog.mkair-runner.service` и убедиться, что в логе появилось `Listening for Jobs`;
- установка на новом хосте — `sudo scripts/server/setup-runner-watchdog.sh` (автодетектит активные `actions.runner.*.service`, прописывает `TARGETS`, ставит скрипт/юниты/`Restart=always` drop-in, включает таймер).
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
- UI feedback remainder (change `ui-polish-batch`): task board drag with animation, per-user folder order, `Switch` instead of boolean checkboxes.
