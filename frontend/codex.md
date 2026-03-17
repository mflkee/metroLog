# Frontend Codex

## Goal
Build a modern React frontend for equipment accounting with a beautiful and practical interface for:
- equipment registry,
- equipment details,
- repair workflow,
- SI verification view,
- Arshin sync actions,
- dashboard and overdue visibility.

Frontend must feel like a real application, not a plain admin table.
It must also cover the functional scope of the MVP workbook
`mvpexcel/uchet_oborudovaniya_demo_v2.xlsx`.

---

## Tech Stack
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

---

## Frontend Principles

### 1. App-like UI
The interface must be modern, clean, and readable.
Main emphasis:
- good hierarchy,
- compact but clear tables,
- strong visual status indicators,
- usable forms,
- minimal clutter.

### 2. Backend-driven business logic
Frontend may display derived values, but critical rules must come from backend:
- stage,
- deadlines,
- overdue,
- verification summary,
- repair progression.

### 3. Fast workflow
User should be able to:
- find a device quickly,
- open its card,
- see where it is now,
- update repair dates,
- understand overdue status instantly.

The UI must still remain workable when the registry becomes large.

### 4. Reusable UI components
Avoid duplicated UI logic.
Build reusable blocks:
- badges,
- cards,
- section headers,
- table filters,
- timeline items,
- form fields.

### 5. Good loading/error/empty states
Every page that fetches data must have:
- skeleton or loading state,
- error state,
- empty state.

List-heavy pages must also have search and filtering controls.

### 6. One page - one function
Navigation should follow clear functional separation similar to workbook sheets.

Examples:
- dashboard is its own page,
- repairs are handled on their own page,
- event log is its own page,
- equipment registry is its own page,
- equipment details is its own page.

Avoid combining several major workflows into one overloaded screen.

### 7. Drill-down navigation for large registries
Equipment should be navigable through a hierarchy:
- folder,
- group,
- equipment.

The user should be able to drill down step by step
instead of working only with one giant flat list.

### 8. Persistent application shell
Authenticated pages should live inside one consistent application frame.

The shell should provide:
- primary navigation to all main sections,
- profile/account entry,
- consistent placement of menu and page title,
- easy movement between sections from any section.

Login and registration screens should stay minimal and separate from the internal shell.

---

## Suggested Project Structure

```text
frontend/
  src/
    app/
    pages/
    widgets/
    features/
    entities/
    shared/
    components/
    lib/
    hooks/
    store/
    api/
    main.tsx
```

A simpler structure is allowed for MVP, but code should still be logically separated.

---

## Main Pages

The page architecture should be aligned with the MVP workbook sheets
from `mvpexcel/uchet_oborudovaniya_demo_v2.xlsx`.

### `/dashboard`

Main operational overview.

Must include:

* navigation entry points to the main sections,
* minimal and clear layout,
* summary cards,
* total equipment count,
* quick access blocks for key sections,
* overdue table,
* upcoming deadlines,
* expiring verification block,
* recent changes/events.

### `/equipment`

Equipment registry.

Must include:

* folder list or tree,
* group list inside selected folder,
* table view,
* filters,
* search,
* sorting,
* quick actions,
* navigation to equipment details.

The main organizational flow should be:
folder -> group -> equipment list.

### `/equipment/:id`

Equipment details page.

Must include:

* main info card,
* verification block for SI,
* repair card,
* timeline,
* event log,
* wide notes/comments area.

If the equipment is SI, the card should also support:

* direct Arshin link,
* detailed Arshin fetch by `vri_id`,
* display of etalon-related details when available.

Notes behavior:

* note entries must show author name,
* note entries must show timestamp,
* adding a note must be available to all users,
* notes should behave like an operational log on the card, not a hidden textarea.

### `/equipment-cards`

Dedicated equipment card access page.

Must include:

* search by key identifiers,
* quick access to detailed cards,
* support for both SI and non-SI equipment,
* emphasis on detailed inspection rather than mass editing.

### `/verification/si`

Dedicated SI verification page or focused workspace.

Must include:

* SI verification list or work queue,
* verification details,
* Arshin sync actions,
* filters for expiration and sync state,
* indicator for uncertain matches,
* manual review workflow for problematic records,
* link to the related equipment card,
* external Arshin link when available.

### `/repairs`

Dedicated repair page.

Must include:

* active repairs tab,
* archived repairs tab,
* stage view,
* overdue markers,
* search,
* filter by stage and repair organization.

### `/events`

Dedicated event journal page.

Must include:

* global event log,
* filters by equipment, event type, date,
* navigation to related equipment and repair records.

### `/references`

Reference data page or admin workspace.

May include:

* dictionaries,
* selectable reference values,
* system-maintained lookup data.

### `/settings`

Settings and administration page.

Later phases may also add:

* `/help`
* `/users`
* `/roles`

These pages should stay function-specific rather than being merged into generic admin screens.

### `/admin/users`

Administrator-only page for user management and permission assignment.

Must include:

* user list,
* search and filters,
* current role visibility,
* role editing controls,
* simple permission-management workflow.

### `/login`

Simple login page.

Must include:

* minimal form,
* clear submit action,
* link to registration,
* no unnecessary marketing content.

### `/register`

Simple registration page.

Must include:

* minimal form,
* clear submit action,
* link to login.

### `/profile`

Simple profile/account page.

Must include:

* basic account info,
* role or permission visibility when relevant,
* account actions kept simple.

---

## Main Components

Suggested components:

### Layout

* `AppShell`
* `Sidebar`
* `Topbar`
* `PageHeader`
* `SectionTabs`
* `AccountMenu`
* `AuthLayout`

### Dashboard

* `StatsCards`
* `OverdueTable`
* `UpcomingDeadlinesList`
* `RecentEventsList`
* `ExpiringVerificationCard`

### Equipment

* `FolderTree`
* `GroupList`
* `EquipmentTable`
* `EquipmentFilters`
* `EquipmentForm`
* `EquipmentSummaryCard`
* `EquipmentMetaBlock`
* `EquipmentNotesPanel`
* `EquipmentNoteList`
* `EquipmentNoteComposer`

### Repair

* `RepairCard`
* `RepairForm`
* `RepairTimeline`
* `RepairStageBadge`
* `DeadlineBadge`
* `OverdueIndicator`

### Verification

* `VerificationCard`
* `VerificationSummary`
* `VerificationMatchBadge`
* `ManualReviewPanel`
* `ArshinLinkButton`
* `ArshinSyncButton`

### Logs

* `Timeline`
* `TimelineItem`
* `EventLogTable`
* `EventLogFilters`

### Users

* `UserTable`
* `UserFilters`
* `RoleBadge`
* `PermissionEditor`

---

## Design and UX Guidelines

### General style

Use a neutral professional enterprise style.
The app should look serious, modern, and clean.

### Visual priorities

User must instantly notice:

* current stage,
* overdue state,
* verification validity,
* where the equipment is now,
* required next action.

### Tables

Tables must be:

* dense but readable,
* filterable,
* sortable,
* with sticky headers if practical,
* responsive enough for common desktop sizes.

### Cards

Use cards for:

* dashboard summaries,
* equipment main info,
* verification summary,
* repair status,
* timeline sections.

The equipment details card should feel like a real working document,
not a tiny metadata panel.

### Forms

Forms must be:

* split into logical sections,
* validated,
* easy to scan,
* consistent in layout,
* capable of handling dynamic fields.

---

## Dynamic Form Rules

### Equipment form

Base fields for all equipment:

* object name
* equipment type
* name
* modification
* serial number
* inventory number
* manufacture year
* status
* notes

If `equipment_type = SI`:
show SI verification-related block.

If `equipment_type != SI`:
hide SI verification-related block.

### Repair form

Must show milestone dates clearly:

* sent to repair
* sent from repair
* sent from Irkutsk
* arrived to Lensk
* actually received
* incoming control
* paid

Derived fields from backend should be shown after save or refresh:

* repair deadline,
* registration deadline,
* control deadline,
* payment deadline,
* overdue summary,
* current stage.

---

## State Management

### Server state

Use TanStack Query for:

* equipment lists,
* details,
* repairs,
* dashboard,
* timeline,
* sync actions.

### Client state

Use Zustand only for lightweight UI state, for example:

* sidebar open/close,
* local filters draft,
* view preferences.

Do not use Zustand as replacement for server state.

---

## API Integration Rules

All server data must come through typed API layer.

Suggested modules:

* `api/equipment.ts`
* `api/repairs.ts`
* `api/dashboard.ts`
* `api/arshin.ts`
* `api/logs.ts`

Each module should expose:

* fetch list,
* fetch item,
* create,
* update,
* action methods when needed.

Use a shared API client wrapper.

---

## Validation

Use:

* React Hook Form
* Zod

Validation goals:

* required fields,
* correct type handling,
* readable messages,
* date field normalization.

Date fields should support standard input strategy chosen by UI, but backend remains final validator.

---

## Main Screens - Functional Expectations

---

## Dashboard

### Purpose

Give user a fast overview of the system state.

### Content

* total equipment,
* quick links to main sections,
* active repairs,
* overdue cases,
* incoming control count,
* payment stage count,
* expiring verifications,
* recent events.

### UX goals

Dashboard should help the user identify priorities in seconds.

It should also serve as a clear navigation start point for the main sections.
It should look restrained and operational, not like a promotional homepage.

---

## Equipment Registry

### Columns

Suggested columns:

* object
* type
* name
* modification
* serial number
* status
* current stage
* current location
* verification valid until
* overdue summary
* actions

### Filters

* folder
* group
* object
* equipment type
* status
* active repair only
* overdue only
* search by name / serial number / certificate number

### UX goals

Registry must support fast scanning and quick access to details.
It must also avoid overload when the equipment base becomes large.

---

## Equipment Details Page

### Sections

1. Main information
2. Verification information
3. Repair status
4. Timeline
5. Event log

### Special behavior

If equipment is not SI:

* hide or collapse verification block.

If equipment has active repair:

* highlight repair section near top.

Notes area:

* show a wide operational notes area,
* render note entries with author and time,
* support easy reading and adding entries,
* keep it visible enough to be actually used in daily work.

### UX goals

Details page must answer:

* what is this device,
* what is its current state,
* where is it now,
* what deadlines matter,
* what happened recently,
* what comments or notes are already recorded.

---

## Repair UI

### Purpose

Represent milestone-based process clearly.

### Requirements

* split repairs into active and archived views,
* show stage progression visually,
* show filled and unfilled milestones,
* show deadlines near related milestones,
* show overdue warnings clearly,
* allow editing milestone dates in a predictable form,
* support search and filtering in repair lists.

### UX goals

The user should understand repair progression without reading raw dates only.

---

## Verification UI

### For SI only

Verification block should show:

* link to the related equipment card,
* Arshin link,
* `vri_id`,
* registration number,
* type name,
* certificate number,
* verification date,
* valid until,
* usable flag,
* verifier,
* source/update info.

### Arshin sync

Provide button or action for backend sync.
Show action states:

* idle,
* loading,
* success,
* error.

Do not call Arshin directly from frontend.

If the backend marks the update as uncertain:

* show a visible `?`-style status,
* require manual operator review,
* allow the operator to open the equipment card and Arshin source quickly.

---

## Event Log UI

### Purpose

Provide a dedicated page for operational history and audit-style browsing.

### Requirements

* global event list,
* filter by event type, equipment, repair, and period,
* search,
* links to related entity pages,
* readable titles and timestamps,
* support for quick scanning of recent changes,
* include create/update/delete-style operational history across the app.

---

## Folder and Group UX

### Purpose

Keep large amounts of equipment navigable.

### Requirements

* create folders,
* edit folders,
* create groups inside folders,
* edit groups,
* browse equipment by selected folder and group,
* support search and filtering in list views,
* support patterns similar to `../metrologet` without copying its UI directly.

---

## Error and Empty States

Every important screen must handle:

* initial loading,
* refresh loading,
* empty list,
* no search results,
* server error,
* sync error.

Messages must be understandable and not overly technical.

---

## Styling Guidelines

Use:

* Tailwind utility classes,
* shadcn/ui primitives,
* consistent spacing scale,
* consistent typography,
* restrained color usage.

Important colors should primarily communicate:

* normal state,
* warning,
* overdue,
* completed state.

Do not overload the interface with too many accent colors.

---

## Accessibility and Practicality

Even if not a full accessibility project, follow basic rules:

* sufficient contrast,
* readable text sizes,
* meaningful button labels,
* visible focus states,
* not relying on color alone.

---

## Frontend Development Stages

---

## Stage 0 - Foundation

* initialize React + TypeScript + Vite,
* connect Tailwind,
* add shadcn/ui,
* configure routing,
* set up query client,
* create app shell,
* set up base API client.

---

## Stage 1 - Equipment Registry MVP

* folders and groups hierarchy,
* equipment list page,
* table columns,
* filters,
* search,
* create/edit form,
* basic details page,
* wide notes field on equipment card.

---

## Stage 2 - Repair Workflow UI

* repair card,
* active/archive tabs,
* repair form,
* stage badge,
* deadline badges,
* show active repair on details page,
* search and filters for repair lists.

---

## Stage 3 - Timeline and Logs

* timeline component,
* dedicated event log page,
* event log table,
* recent changes blocks.

---

## Stage 4 - SI Verification and Sync

* verification card,
* sync action,
* status feedback,
* details block for SI records,
* uncertain match indicator,
* manual review flow,
* Arshin detail link and `vri_id`-based detail fetch support.

---

## Stage 5 - Dashboard

* summary cards,
* overdue blocks,
* expiring verification view,
* recent events.

---

## Stage 6 - UX Hardening

* better skeleton states,
* better empty states,
* mutation feedback,
* confirmation dialogs where useful,
* responsive polishing,
* clear page-level navigation between functional areas.

---

## Stage 7 - Auth and User Administration

* login and registration integration,
* profile page wiring,
* protected routes,
* administrator-only user management page,
* user list and filters,
* role assignment controls.

---

## Authentication and Permissions

Authentication is a later phase,
but the frontend should be ready for:

* user login,
* user registration,
* profile page,
* admin-only user management page,
* role-based page visibility,
* role-based action visibility,
* protected routes for operational sections.

Do not assume all users will have the same access level.

Initial roles to plan for:

* `ADMINISTRATOR`
* `MKAIR`
* `CUSTOMER`

Initial page/action expectations:

* equipment page visible to all roles, editing for `ADMINISTRATOR` and `MKAIR`,
* SI verification visible to all roles, sync/update actions for `ADMINISTRATOR` and `MKAIR`,
* repairs visible to all roles, repair date editing for `ADMINISTRATOR` and `MKAIR`,
* event log visible to `ADMINISTRATOR` and `MKAIR`,
* equipment cards visible to all roles,
* note adding on equipment cards available to all roles,
* user management page visible only to `ADMINISTRATOR`,
* role and permission assignment available only to `ADMINISTRATOR`.

---

## Definition of Done

Frontend task is complete only when:

* UI exists,
* API is connected,
* loading state exists,
* error state exists,
* empty state exists when relevant,
* form validation works,
* visual hierarchy is clear,
* behavior matches backend contract.
