# Project Codex

## Project Name
Equipment Accounting and Repair Tracking System

## Goal
Build a web application for accounting laboratory and production equipment with a clear repair workflow, verification tracking, and Arshin integration for SI equipment.

The system must provide:
- a clean and modern application-like interface,
- clear equipment cards opened from the common registry,
- repair lifecycle tracking,
- dashboard with deadlines and overdue states,
- synchronization of SI verification data from Arshin,
- scalability for large equipment registries through folder and group organization,
- a future-ready authentication system with roles and permissions,
- staged development suitable for CLI-driven AI-assisted coding.

---

## Functional Reference Workbook

The current MVP functional reference is:
`mvpexcel/uchet_oborudovaniya_demo_v2.xlsx`

The web application must eventually cover the full functional scope of this workbook.
The UI does not need to visually copy Excel,
but the business coverage and navigation model should be derived from it.

Workbook-to-product mapping:
- `Главная` -> dashboard page and application entry navigation
- `Оборудование` -> equipment registry page
- `Поверка_СИ` -> SI verification page/workspace
- `Ремонты` -> repairs page/workspace
- `Журнал_событий` -> event log page
- `Карточка_прибора` -> detailed equipment card reached from the common registry
- `Справочники` -> reference data pages
- `Настройки` -> settings/admin page
- `Как_пользоваться` -> help/onboarding page or built-in documentation

If workbook behavior and written specification differ,
the product decision should be clarified explicitly before implementation.

---

## Product Direction Clarifications

The UI should behave like a structured application with clear sections,
not like one overloaded page.

Current high-level product expectations:
- the main page should provide navigation to all main sections,
- the system must support both SI and non-SI equipment in one product,
- SI verification is a dedicated operational area,
- event log is a dedicated operational area,
- equipment cards are reached from the common equipment workflow and are not a separate top-level workspace,
- repair workflow remains a separate area and will be refined later,
- authentication and role-based permissions must be planned from the start as an internal admin-managed account system.

### Equipment vs SI workspace

The common `Оборудование` page and the dedicated `Поверка СИ` page must remain separate workflows.

Current expectation:
- the `Оборудование` page is the common registry for all equipment,
- the `Оборудование` page should show only basic operational information needed to browse and choose a record,
- the most important column on the common equipment list is the current status,
- clicking a record in `Оборудование` must open the detailed equipment card,
- SI-specific detailed data should become visible inside the equipment card only for SI records,
- the dedicated `Поверка СИ` page is the place for SI-specific tables, calculations, deadlines, remaining days, and verification-focused work.

### Authentication expectations

The target auth flow should behave like an internal business application,
not like a public self-service registration system.

Required auth behavior:
- there is no open public registration in the MVP,
- one bootstrap administrator must exist for initial system access,
- administrators create user accounts from the user-management page,
- user creation must support assigning role and issuing a temporary password,
- first login with a temporary password must require immediate password change,
- profile page must support direct password change,
- profile page must support editing profile metadata such as phone, organization, position, and facility,
- administrators must be able to reset a user's password by issuing a new temporary password,
- administrators must be able to open another user's account page and review their contact or role-related data,
- if an administrator opens their own record from the user-management area, the UI should route them to the regular profile page,
- email or Telegram delivery for credentials/recovery may be added later, but is not required for MVP.

Profile metadata currently expected in the MVP:
- phone
- organization
- position
- facility

### Application frame expectations

The application should use one shared operational frame across internal pages.

Expected behavior:
- after login, the user lands in the internal application shell,
- navigation between sections must be available from every main page,
- the shell should feel similar to Excel sheet navigation, but in a cleaner web form,
- profile access should always be available from the shared frame,
- login screen should stay simple and utilitarian,
- the product should not prioritize a marketing-style landing page.

### Initial user roles from the Excalidraw draft

The current product draft defines these user roles:
- `ADMINISTRATOR`
- `MKAIR`
- `CUSTOMER`

Current functional access expectations:
- Equipment page: visible to all users, editing allowed for `ADMINISTRATOR` and `MKAIR`
- SI verification page: visible to all users, SI update/sync allowed for `ADMINISTRATOR` and `MKAIR`
- Repairs page: visible to all users, repair date updates allowed for `ADMINISTRATOR` and `MKAIR`
- Event log page: visible to `ADMINISTRATOR` and `MKAIR`
- Equipment card page: visible to all users
- Equipment card note additions: allowed for all users
- User management page: visible only to `ADMINISTRATOR`, with rights assignment controls

These permissions should be treated as the current baseline
until replaced by a more detailed RBAC matrix later.

---

## Development Format

Development is performed from the project root using CLI tools.

Main workflow:
1. prepare specification for a feature,
2. implement backend contract and domain logic,
3. implement frontend UI for the same feature,
4. connect frontend to backend,
5. test the feature,
6. commit the result,
7. move to the next feature.

The project must be built iteratively.
Do not attempt to implement the whole product in one pass.

---

## Documentation Strategy

At the current stage, the project should avoid multiplying specification files.

Primary working documents:
- `codex.md`
- `backend/codex.md`
- `frontend/codex.md`
- `development.md`

For now, separate files such as `db_schema.md`, `api_contract.md`, and `user_flows.md`
are not required.
Schema notes, API decisions, and workflow clarifications should be added
to the existing codex files and the development buffer.

Create additional spec files later only if the current documents become overloaded
or conflicting.

---

## Recommended Stack

### Backend
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL
- Alembic
- Pydantic v2
- httpx
- Redis
- RQ or Celery
- pytest

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TanStack Table
- React Hook Form
- Zod
- Zustand

### Infrastructure
- Docker
- Docker Compose
- Git

---

## Working Principles for AI-assisted Development

When implementing tasks, always follow these principles:

### 1. Feature-first development
Each feature must be built end-to-end in a small vertical slice:
- backend model,
- backend schema,
- backend API,
- frontend page/component,
- integration,
- tests.

### 2. Small iterations
Every task must be small enough to be reviewed quickly.
Avoid giant rewrites.

### 3. Specification before implementation
Before coding a feature, define:
- what user problem it solves,
- which entities are involved,
- which API endpoints are required,
- which UI states are needed,
- which validations and business rules apply.

### 4. Backend is source of truth
Critical business logic must be computed on backend:
- stage calculation,
- deadline calculation,
- overdue calculation,
- Arshin sync parsing,
- validation of equipment type rules.

### 5. Frontend focuses on usability
Frontend should:
- render data clearly,
- provide filters and forms,
- show loading and error states,
- never reimplement critical business rules as the only source of truth.

### 6. No direct frontend access to Arshin
Frontend never calls Arshin directly.
All integration must go through backend.

### 7. Safe incremental changes
Before changing existing logic:
- inspect related files,
- preserve compatible API where possible,
- avoid breaking current behavior unless explicitly required.

---

## Local Reference Repositories

If the current specification is incomplete or implementation details are unclear,
the project may use sibling repositories located one directory above the project root
as reference implementations and idea sources.

Primary references:
- `../metrologenerator` - the most useful FastAPI reference for backend structure, Arshin integration, settings, dependencies, and tests.
- `../search_docnum` - useful reference for Arshin search workflows, throttling, retry behavior, and contract-oriented tests.
- `../metrologet` - legacy reference for domain behavior and older equipment-related patterns when needed.

Rules for using references:
- use them as implementation references, not as blind copy sources,
- prefer adapting proven patterns over inventing behavior from scratch,
- keep this project architecture and naming consistent even when borrowing ideas,
- if Arshin integration details are unclear, check the reference repositories before designing a new approach,
- if a ready solution exists there, reuse the approach only after aligning it with this project specification.

---

## Product Modules

1. Dashboard
2. Equipment folders and groups
3. Equipment registry
4. Equipment details card
5. SI verification and Arshin integration
6. Event log / timeline
7. Repair workflow
8. Reference data and settings
9. User administration and permissions
10. Authentication and authorization
11. Notifications and reports (later phase)

---

## Equipment Types

Supported equipment categories:
- SI
- IO
- VO
- OTHER

Rules:
- SI has verification-related fields and Arshin sync support.
- IO, VO and OTHER do not require SI-specific verification fields.
- UI must hide SI-only blocks for non-SI equipment.
- backend must validate SI-specific data rules.
- repair and movement workflow must remain understandable for both SI and non-SI equipment.

Additional registry rule:
- all equipment rows in the common registry must be clearly marked by category/type,
- each equipment item belongs to exactly one category from `SI`, `IO`, `VO`, or `OTHER`,
- `SI` is a separate category because it later participates in the Arshin-linked state workflow,
- `OTHER` can be used for parts or standalone units such as a power supply block that still need their own repair lifecycle,
- inventory number is not part of the required product model and must not be introduced into the registry UX.

---

## Navigation Paradigm

Use the principle:
`1 page = 1 functional area`

This means:
- event log is a dedicated page,
- repairs are handled on a dedicated page,
- equipment registry is a dedicated page,
- equipment details card is a dedicated page,
- SI verification actions may have their own dedicated page or focused workspace,
- avoid overloaded screens that mix several independent workflows at once.

The navigation model should feel similar to workbook sheets:
each core operational function has a clear entry point in the application.

Primary functional areas currently expected:
- dashboard / home,
- equipment registry,
- SI verification,
- event log,
- repairs,
- settings and reference data later.

Shell expectations:
- the left sidebar is the primary persistent navigation,
- there is no duplicate top tab strip for the same sections,
- the sidebar can collapse into an icon-only mode to increase working space,
- the top bar should stay visually light and not compete with the registry workspace.

All pages that primarily display lists must support:
- search,
- filtering,
- clear empty states,
- scalable navigation when records become numerous.

---

## Large Registry Organization

The equipment registry must remain usable when the amount of equipment becomes large.

To support this, the product should introduce a hierarchy:
- folder,
- group inside folder,
- equipment inside group.

Example:
- folder: `Химико-аналитическая лаборатория №1`
- groups inside that folder for logical equipment subsets

Requirements:
- folders and groups are created, edited, and stored in the database,
- folders, groups, and equipment support create, edit, and delete operations,
- equipment can be organized through this hierarchy,
- the UI must support drilling down from folder to group to equipment,
- the user should first choose a folder node,
- creating a folder, group, or equipment item should happen through modal dialogs instead of large always-open forms,
- destructive actions must require a clear confirmation question before execution,
- after a folder is selected, the user should be able to either:
  - show all groups inside that folder,
  - or narrow the list to one specific group,
- this structure should be inspired by proven patterns already used in `../metrologet`,
- SI and non-SI equipment should coexist inside the same organizational structure,
- equipment must still belong to the selected folder even when no group is assigned,
- the registry table should visually dominate the workspace and use most of the free width.

The `Оборудование` page should follow a focused `metroloGet`-style browsing pattern:
- first choose folder,
- then optionally choose one group,
- then work with the resulting list,
- creation controls should stay secondary to the table itself,
- edit and delete controls should exist but remain visually secondary to browsing,
- avoid showing too many creation and editing controls at once.

Additional shell and appearance expectations:
- the application title in the top area should remain short: `metroLog`,
- theme switching and font switching are part of the shell-level personalization,
- default light palettes must avoid harsh glare on long working sessions.

---

## SI Verification Review Paradigm

The SI verification area should support automatic update attempts from Arshin,
but the system must not assume every automatic match is trustworthy.

Requirements:
- if an SI update is uncertain, the UI should mark it clearly, for example with a `?` state,
- uncertain SI records must be placed into a manual review workflow,
- the operator must be able to quickly open both:
  - the related equipment record in the application,
  - the related page in Arshin,
- if needed, the system should perform an additional detail lookup by `vri_id`
  to obtain richer Arshin data such as standards/etalons,
- the product should reuse ideas from `../search_docnum` and `../metrologenerator`
  for staged search, uncertain match detection, and detailed lookup.

---

## Equipment Card Expectations

Equipment cards must be accessible directly from the equipment registry
without requiring a separate top-level cards section.

Each card should answer:
- what the device is,
- where it belongs organizationally,
- whether it is SI or not,
- what verification data exists if it is SI,
- what recent changes happened,
- what notes the user has recorded about it.

Each card must include a wide notes/comments area for operational remarks.

Notes requirements:
- notes should support adding separate entries, not only one overwritten text blob,
- each note entry must record the user name,
- each note entry must record the timestamp,
- all users may add note entries,
- note history should remain visible in the equipment card.

---

## Core Business Rules

### Active repair
Each equipment item can have at most one active repair at a time.

### Repair deadlines
Derived deadlines:
- repair deadline = `sent_to_repair_at + 100 days`
- registration deadline = `arrived_to_lensk_at + 5 days`
- control deadline =
  - `actually_received_at + 40 days` if `actually_received_at` exists
  - otherwise `registration_deadline_at + 40 days`
- payment deadline =
  - `incoming_control_at + 70 days` if `incoming_control_at` exists
  - otherwise `control_deadline_at + 70 days`

### Current stage
Current stage must be derived from actual repair milestone dates.

Example order:
- if `paid_at` exists -> repair completed
- else if `incoming_control_at` exists -> payment stage
- else if `actually_received_at` exists -> incoming control stage
- else if `arrived_to_lensk_at` exists -> awaiting receiving in Lensk
- else if `sent_from_irkutsk_at` exists -> in transit Irkutsk to Lensk
- else if `sent_from_repair_at` exists -> sent from repair
- else if `sent_to_repair_at` exists -> in repair
- else -> in work

### Overdue calculation
For every relevant stage:
- if actual completion date exists, overdue is calculated to actual completion date,
- otherwise overdue is calculated to current date.

---

## Development Phases

---

## Phase 0 - Project Foundation

Goal:
Prepare project skeleton and development environment.

Tasks:
- create repository structure,
- initialize backend application,
- initialize frontend application,
- set up Docker Compose,
- configure PostgreSQL,
- configure Redis,
- prepare `.env.example`,
- configure migrations,
- create basic healthcheck endpoints,
- create frontend app shell,
- configure linting and formatting,
- configure testing base.

Expected result:
A runnable empty project with backend, frontend and infrastructure.

---

## Phase 1 - Equipment Registry MVP

Goal:
Create core accounting functionality for equipment.

Tasks:
- create Equipment entity,
- create database migration,
- implement CRUD API,
- implement equipment list page,
- implement create/edit form,
- add filtering and search,
- add details page,
- add seed/demo data.

Expected result:
User can create, view, edit and filter equipment records.

---

## Phase 2 - Repair Workflow MVP

Goal:
Track equipment movement through repair stages.

Tasks:
- create Repair entity,
- create one-active-repair rule,
- implement repair creation/editing,
- compute deadlines,
- compute overdue values,
- compute current stage,
- create repair timeline view,
- show repair info in equipment card.

Expected result:
User can track repair lifecycle and see where equipment currently is.

---

## Phase 3 - Event Log and Timeline

Goal:
Create audit trail and timeline of important events.

Tasks:
- create EventLog entity,
- generate event rows automatically from repair stage changes,
- add timeline API,
- add event log UI,
- show latest changes on dashboard.

Expected result:
Every major repair milestone is visible in a clear historical sequence.

---

## Phase 4 - Arshin Integration for SI

Goal:
Synchronize verification data for SI equipment.

Tasks:
- create SI verification entity,
- create Arshin integration client,
- normalize external data,
- implement search endpoint,
- implement sync endpoint,
- implement task status endpoint if sync is background-based,
- add frontend sync action,
- show verification block in equipment card.

Expected result:
User can sync SI verification data from Arshin through backend.

---

## Phase 5 - Dashboard

Goal:
Build overview of current operational state.

Tasks:
- summary counters,
- overdue lists,
- upcoming deadlines,
- expiring verification list,
- recent changes,
- concise status cards.

Expected result:
The dashboard becomes the main entry point for daily work.

---

## Phase 6 - Hardening

Goal:
Prepare system for stable real usage.

Tasks:
- tests for business rules,
- API validation hardening,
- better error handling,
- optimistic frontend UX improvements,
- loading/skeleton/error states everywhere,
- logging,
- environment configuration review,
- backup and migration strategy.

Expected result:
System is stable enough for controlled production adoption.

---

## Phase 7 - Advanced Features

Later phase, not part of initial MVP:
- authentication,
- roles and permissions,
- administrator user-management panel,
- attachments,
- Excel import/export,
- notifications,
- bulk sync from Arshin,
- field-level audit history,
- reporting.

---

## Expected Repository Structure

```text
/
  backend/
  frontend/
  codex.md
  backend/codex.md
  frontend/codex.md
  development.md
  docker-compose.yml
  .env.example
  README.md
```

---

## CLI-oriented Development Rules

Development is expected to be executed from the project directory.

Recommended work style:

1. open project root in terminal,
2. read `codex.md`, `backend/codex.md`, `frontend/codex.md`, `development.md`,
3. implement one feature per iteration,
4. run backend tests,
5. run frontend checks,
6. verify Docker environment,
7. commit.

Do not mix several unrelated features in one iteration.

---

## Rules for Task Execution

For every task:

1. identify files to create or change,
2. implement minimal working slice,
3. keep naming consistent,
4. avoid dead code,
5. avoid duplicate business logic,
6. add tests where logic is important,
7. keep code easy to extend.

When uncertain, prefer explicit readable code over clever abstractions.

---

## Non-Functional Requirements

* professional and readable UI,
* predictable API contracts,
* maintainable codebase,
* clean separation of backend/frontend concerns,
* scalable enough for future growth,
* easy local startup with Docker Compose.

---

## Deliverables

Final project should include:

* backend application,
* frontend application,
* database migrations,
* Docker setup,
* demo data,
* tests,
* documentation,
* stable API for frontend integration.

---

## Definition of Done for Each Phase

A phase is complete only when:

* code is implemented,
* app runs locally,
* API and UI are connected,
* basic validations exist,
* obvious edge cases are handled,
* related tests are added where applicable,
* documentation/spec is updated if needed.





на чем закончили, кончились кредиты на кодекс • Сделал.

  Что поменял:

  - Редактировать / Удалить в плотных местах заменены на иконки;
  - в группах теперь больше нет двух текстовых мини-кнопок, только компактные кнопки с ручкой и крестиком;
  - в таблице приборов тоже иконки;
  - у папок в карточках тоже иконки;
  - в карточке прибора удаление тоже переведено на иконку;
  - слева в навигации вместо буквенных бейджей теперь NF-иконки.

  Основные файлы:

  - frontend/src/lib/nav.ts
  - frontend/src/components/layout/Sidebar.tsx
  - frontend/src/pages/EquipmentPage.tsx
  - frontend/src/pages/EquipmentDetailsPage.tsx
  - frontend/src/shared/styles.css

  Технически:

  - для иконок добавил отдельный класс .nf-icon, чтобы они не зависели от текущего выбранного UI-шрифта;
  - action-кнопки теперь идут через единый стиль .icon-action-button.

  Проверка:

  - git diff --check чистый

  Теперь пересобери frontend:

  docker compose up --build -d
  docker compose logs -f frontend

  Если какие-то конкретные NF-иконки покажутся неудачными по смыслу, я следующим сообщением быстро заменю их точечно:

  - Главная
  - Оборудование
  - Поверка СИ
  - Ремонты
  - Настройки
  - Журнал
  - Пользователи


› еще у меня выбивается из темы, когда в папку захожу а там нет оборудования и вот это окно Под текущие фильтры приборы не найдены.

  Измени фильтры или добавь первый прибор в выбранную папку. так же иконки не отображаются, просто ошибка у меня, как будто шрифт не может
  рендериться правильно тут


• Сейчас исправлю оба источника шума: пустое состояние в папке переведу на нормальный theme-aware блок без инородного фона, а иконки уберу
  с зависимости от NF-шрифта и заменю на встроенные SVG, чтобы они рендерились стабильно у тебя в любом окружении.

• Explored
  └ Search f8fbfc|nf-icon|nav-icon-badge|icon-action-button|Под текущие фильтры приборы не найдены|Папок пока нет|equipment empty|icon in
           EquipmentPage.tsx
    Read nav.ts, Sidebar.tsx, EquipmentPage.tsx, styles.css

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Сделаю иконки аппаратно надёжными: убираю зависимость от символов шрифта и перевожу всё на маленькие inline SVG. Это гарантированно
  снимет артефакты рендера и оставит тот же компактный вид без плясок вокруг font fallback.

• Added frontend/src/components/Icon.tsx (+87 -0)
     1 +type IconName =
     2 +  | "home"
     3 +  | "equipment"
     4 +  | "verification"
     5 +  | "repairs"
     6 +  | "settings"
     7 +  | "events"
     8 +  | "users"
     9 +  | "edit"
    10 +  | "delete";
    11 +
    12 +type IconProps = {
    13 +  name: IconName;
    14 +  className?: string;
    15 +};
    16 +
    17 +export function Icon({ name, className }: IconProps) {
    18 +  const baseClassName = className ?? "h-5 w-5";
    19 +
    20 +  switch (name) {
    21 +    case "home":
    22 +      return (
    23 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
    24 +          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
    25 +          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 9.75V21h13.5V9.75" />
    26 +        </svg>
    27 +      );
    28 +    case "equipment":
    29 +      return (
    30 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    31 +          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15v12h-15z" />
    32 +          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5h7.5" />
    33 +          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5M8.25 15.75h4.5" />
    34 +        </svg>
    35 +      );
    36 +    case "verification":
    37 +      return (
    38 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    39 +          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6" />
    40 +          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3v5.25L5.25 18a2.25 2.25 0 0 0 1.98 3.3h9.54a2.25 2.25 0 0 0
        1.98-3.3L13.5 8.25V3" />
    41 +          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 13.5h4.5" />
    42 +        </svg>
    43 +      );
    44 +    case "repairs":
    45 +      return (
    46 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    47 +          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 5.25a4.5 4.5 0 0 0-5.9 5.9L4.5 15v4.5H9l3.85-3.85a4.5 4.5 0
        0 0 5.9-5.9l-2.7 2.7-2.55-.45-.45-2.55 2.7-2.7Z" />
    48 +        </svg>
    49 +      );
    50 +    case "settings":
    51 +      return (
    52 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    53 +          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 0 1 3.35 0 1.724 1.724 0 0 0 2.573 1.06
        6 1.724 1.724 0 0 1 2.36 2.36 1.724 1.724 0 0 0 1.065 2.573 1.724 1.724 0 0 1 0 3.35 1.724 1.724 0 0 0-1.066 2.573 1.724 1.724 0 0
        1-2.36 2.36 1.724 1.724 0 0 0-2.573 1.065 1.724 1.724 0 0 1-3.35 0 1.724 1.724 0 0 0-2.573-1.066 1.724 1.724 0 0 1-2.36-2.36 1.724
        1.724 0 0 0-1.065-2.573 1.724 1.724 0 0 1 0-3.35 1.724 1.724 0 0 0 1.066-2.573 1.724 1.724 0 0 1 2.36-2.36 1.724 1.724 0 0 0 2.573-
        1.065Z" />
    54 +          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
    55 +        </svg>
    56 +      );
    57 +    case "events":
    58 +      return (
    59 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    60 +          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4.5 2.25" />
    61 +          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
    62 +        </svg>
    63 +      );
    64 +    case "users":
    65 +      return (
    66 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    67 +          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    68 +          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
    69 +        </svg>
    70 +      );
    71 +    case "edit":
    72 +      return (
    73 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
    74 +          <path strokeLinecap="round" strokeLinejoin="round" d="m16.86 3.49 3.65 3.65" />
    75 +          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5 8.25 18.75l10.94-10.94a1.875 1.875 0 0 0-2.65-2.65L5.6 16
        .1 4.5 19.5Z" />
    76 +        </svg>
    77 +      );
    78 +    case "delete":
    79 +      return (
    80 +        <svg className={baseClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
    81 +          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
    82 +          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
    83 +          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
    84 +        </svg>
    85 +      );
    86 +  }
    87 +}


