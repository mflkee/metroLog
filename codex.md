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

The UI must also remain compact and operational on smaller laptop screens.
Large decorative spacing, oversized cards, and overly verbose controls should be avoided
when they reduce the usable workspace for tables and operational forms.

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

SI creation rule:
- non-`SI` equipment may be created through regular manual equipment forms,
- `SI` equipment must not be created as plain manual CRUD,
- `SI` is added through Arshin search flow,
- the record is created from Arshin response data,
- the onboarding search should work from certificate number without forcing the user to type the year,
- after selecting the Arshin search result, the system must fetch detailed data by `vri_id`,
- the created `SI` record should store both the short search payload and the detailed Arshin payload,
- later certificate refresh should be possible from the card by entering only the new certificate number and updating the SI data from Arshin.
- bulk `SI` onboarding should also be possible from an uploaded Excel/CSV file with certificate numbers inside the selected folder workspace,
- bulk import must return a row-level report so the operator can see which rows were created, skipped, or failed.

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
- shell-level theme preference should be stored per user account and restored after login on any client,
- settings must allow the user to decide which theme presets stay visible in the top-right shell switcher,
- the default visible presets for a new user should remain `light`, `gray`, and `dark`,
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
- Equipment card note edit/delete: allowed only for the author of the note entry
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

Where practical, repetitive operational actions should prefer concise icon-based controls
instead of long textual buttons, especially in dense registry and card workflows.

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
- inventory number is not part of the required product model and must not be introduced into the registry UX,
- once the user enters a folder, the workspace should stay minimal: only the folder title, actions, filters, and the equipment table should remain visible above the registry.

---

## SI Verification Future Plans (Later Phase)

The SI verification workspace (`Поверка СИ`) should follow a similar pattern to the repairs page:

### SI Verification List Page
- Display active SI equipment currently in verification
- Show verification deadlines and remaining days
- Support filtering by verification status
- Archive completed verifications

### Equipment Card for SI in Verification
When viewing an SI equipment item that is currently in verification, the card should show:
1. **Basic equipment data** - name, type, serial number, etc.
2. **Comments/Notes frame** - general notes about the equipment
3. **Verification dialog frame** (only if in verification) - a conversation-style thread where:
   - Users can add comments with timestamps
   - Attach files, photos, documents (verification certificates, photos of equipment, etc.)
   - All attachments are stored and organized by date
4. **Verification movement tracker** - a collapsible stage block with fixed dates for:
   - sent to destination,
   - received at destination,
   - handed to CSM,
   - verification completed,
   - picked up from CSM,
   - shipped back,
   - received back

Movement tracker rules:
- milestone editing belongs to the dedicated `Поверка СИ` workspace rather than the equipment card,
- the equipment card should keep only the compact current state plus the verification dialog,
- milestone updates must automatically write a system message into the verification dialog,
- the dialog must remain available as a separate thread and must not be replaced by milestone fields,
- the collapsed verification panel should show the current derived state, for example:
  - waiting for receipt at destination,
  - at CSM for verification,
  - verification completed,
  - shipped back,
  - received back.

### Archive System
- When verification is completed, all data (comments, attachments, verification results) is packaged into an archive
- Archive is stored as a ZIP file on a separate disk/storage
- Users can download the ZIP archive from the "Archived Verifications" section
- Clients can extract the ZIP to view all files and documentation offline

### Technical Notes
- The "Repairs" and "Verification" pages are essentially lists showing equipment in those states
- They display different data but follow the same architectural pattern
- Archive functionality enables long-term storage and client distribution of completed verification records

---

## Repair and Verification Process Model

Repair and verification must be modeled as two independent processes.

Rules:
- repair is available for all equipment categories,
- verification is available only for `SI`,
- an `SI` item may be in repair and in verification at the same time,
- these two states must not overwrite or hide each other,
- one equipment item must not be allowed to start a second active repair while one is already open,
- one `SI` item must not be allowed to start a second active verification while one is already open,
- the equipment card may therefore show two independent active process panels at once:
  - `Прибор находится в ремонте`,
  - `Прибор находится в поверке`.

### Equipment card process panels

The equipment card should no longer prioritize a `neighboring equipment` block.
Instead, the card should include:
- `Вложения` block for files, images, PDFs, and related documents,
- `Комментарии` block for static equipment-level comments,
- active process panels for repair and verification when those processes exist.

Comments rules:
- comments are static equipment-level information,
- comments do not disappear or reset when repair or verification state changes,
- each comment entry stores author, timestamp, and text.

Attachments rules:
- attachments may be added from the equipment card,
- attachments may belong either to the equipment in general or to a specific active process,
- supported attachment types should include documents, PDFs, photos, and similar operational files.

### Process dialog behavior

When an equipment item is sent to repair or verification,
the card should show a dedicated process dialog panel below the main card.

This process dialog should behave closer to a messenger thread:
- users can leave operational messages,
- each message stores author and timestamp,
- files and photos can be attached inline with the message,
- repair creation does not ask for repair organization; it asks for route fields such as city and destination,
- when sending to repair, the operator may attach the first message and files immediately, but this initial message is optional,
- examples include notes such as `прибор упакован и отправлен в поверку` with supporting photos.

### Bulk process actions

The registry should support bulk sending of selected equipment into processes.

Rules:
- mixed selection of `SI` and non-`SI` may be sent in bulk only to repair,
- selection containing only `SI` may be sent in bulk either to repair or to verification,
- if exactly one row is selected, the registry should keep the same modal pattern but execute a single repair or verification create flow rather than a semantically grouped one,
- bulk send creates a shared process batch or grouped process,
- equipment cards included in one grouped batch should display synchronized process dialog data for that batch,
- the grouped batch should still remain traceable per equipment item.

Accepted decisions:
- one grouped process should use one shared dialog thread for the whole batch,
- equipment may be added to or removed from an existing grouped batch later,
- removing one member from an existing grouped batch should detach it into its own still-active standalone process while preserving a snapshot of the shared dialog history that existed before detachment.

### Completing and archiving processes

Repairs and verifications should move to archive only after explicit completion.

Rules:
- repair completion is available only after the payment step is marked complete,
- grouped repair or grouped verification may also be completed in bulk,
- grouped repair and grouped verification should both behave as one shared batch process in their dedicated process pages,
- when a process is completed, its active dialog panel disappears from the card,
- when a process is completed, registry-facing status must immediately be recalculated from the still-active processes:
  - no active repair and no active verification -> `В работе`,
  - active repair only -> `В ремонте`,
  - active verification only -> `В поверке`,
  - both active -> `В ремонте/поверке`,
- instead of the active panel, the card should show a compact archive record,
- the archive list entry may stay compact by default but should support expansion for informative details such as group composition and milestone dates,
- the archive record should include a download action in the top-right corner,
- downloading should return a ZIP archive containing `dialog.txt` plus a `files/` folder with the dialog attachments.

### Repair page presentation

The repair page should represent stages in a vertical operational table,
inspired by the Excel MVP but adapted for the application.

Each stage row should show at least:
- stage name,
- actual date,
- deadline,
- completed / not completed state.

Later, the product may add a visual tracker strip that highlights:
- factual movement events,
- deadlines,
- stage markers,
- hover details,
- navigation into the dedicated repair page.

---

## Export Expectations

Operational list pages should support Excel export.

Initial export targets:
- equipment registry,
- repairs,
- SI verification registry.

Rules:
- export must respect the current filters and search state,
- if the user narrowed the list, only the filtered result should be exported,
- export data should be produced from the backend query result rather than only from frontend-rendered rows.
- later the system should also support bulk SI onboarding from an uploaded Excel file with certificate numbers, so matching Arshin records can be resolved and added in batch.

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

Event log is now a concrete operational slice, not just a future placeholder:
- it should surface the global audit stream for equipment, repair, and verification actions,
- it should support free-text search plus category and period filters,
- operators should be able to jump from an event row into the related equipment card when the record still exists.

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
- the registry table should visually dominate the workspace and use most of the free width,
- the UI should reuse folder-local suggestions for recurring manual values where practical,
- if a device has an active repair, registry-facing status should read as `in repair`.

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
- only the author of a note entry may edit or delete that note entry,
- note history should remain visible in the equipment card.

Additional card requirements:
- the old `neighboring equipment` block should be replaced by `Вложения`,
- attachments should support documents, PDFs, photos, and related materials,
- comments remain static equipment-level information and do not reset when process state changes,
- the card must expose `send to repair` for any equipment,
- the card must expose `send to verification` only for `SI`,
- active repair and active verification should appear as separate process panels when both exist.

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

Current implemented baseline already includes part of that later list:
- attachments,
- Excel import/export,
- dashboard,
- event journal,
- first email-notification slice for `@mentions`.

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
