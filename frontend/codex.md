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

Compactness is a hard requirement:
- the interface must stay efficient on smaller laptop screens,
- avoid oversized cards, oversized empty zones, and decorative spacing,
- action-heavy workflows should prefer dense layouts and icon-based controls where clarity is preserved.

Date input formatting is a hard UI rule:
- every date field, date input, and date picker in the application must use the Russian-style `dd.mm.yyyy` presentation,
- `mm/dd/yyyy` style is not allowed anywhere in the product UI,
- this rule applies consistently across registry forms, repair workflows, verification workflows, filters, and modal dialogs.

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

Uniformity is a hard frontend rule:
- if two buttons, fields, cards, rows, badges, or modal actions stand next to each other, they must follow one shared size and visual rhythm,
- neighboring controls must not drift into arbitrary height, padding, radius, or typography differences,
- destructive, secondary, and primary actions may differ by color and semantic emphasis, but not by accidental sizing or broken alignment,
- modal windows must also follow one shared spacing, action placement, and control sizing pattern,
- it is categorically forbidden to introduce one-off UI elements that break the common visual system without a deliberate design-system update.

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

Login should stay minimal and separate from the internal shell.

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

* folder-first navigation,
* folder cards on the first level,
* group list inside selected folder,
* ability to show all groups in the selected folder or one specific group,
* table view,
* filters,
* search,
* navigation to equipment details.

The main organizational flow should be:
folder -> group -> equipment list.

Additional UX expectations:

* the page should behave closer to `metroloGet` and not like one overloaded admin screen,
* the user first chooses a folder node,
* after the user enters a folder, the main focus should be the equipment table,
* then optionally narrows to one specific group,
* groups are optional for placing equipment inside a folder,
* then works with the resulting equipment list,
* the list should show only basic operational information,
* the most important field in the registry is the current status,
* every row should have a clear type/category marker,
* clicking a row should open the detailed equipment card,
* creation actions for folders, groups, and equipment should use modal dialogs,
* editing actions for folders, groups, and equipment should use compact secondary controls,
* deleting folders, groups, and equipment should require a confirmation dialog,
* creation buttons should stay visually secondary and should not dominate the screen.

Creation flow difference:

* non-`SI` equipment may be created through the normal manual equipment form,
* when the user selects `SI`, the UI should switch into Arshin search flow instead of a plain manual form,
* the Arshin search should support the search modes already proven in `../metroSearch`,
* the onboarding search should work from certificate number without forcing a separate year field in the UI,
* after the user selects an Arshin result, the UI should load detail by `vri_id`,
* confirmed `SI` creation should populate the new record from backend Arshin data.

The common registry should not be the main place for SI-specific calculations.
Those belong to the dedicated `/verification/si` workspace.

### `/equipment/:id`

Equipment details page.

Must include:

* main info card,
* verification block for SI,
* repair card,
* attachments block instead of neighboring equipment,
* timeline,
* event log,
* wide notes/comments area.

If the equipment is SI, the card should also support:

* direct Arshin link,
* a collapsible SI block with the Arshin-oriented field names,
* staged delivery: first show the stored basic Arshin profile, then store and expose detailed payload by `vri_id`,
* display of etalon-related details when available,
* fuller SI detail output than the common registry,
* quick refresh by entering a new certificate number when a new certificate appears.

Navigation rule:

* opening a device from `/equipment` must lead to `/equipment/:id`,
* SI-specific fields appear on the card only when the selected record is SI.

Notes behavior:

* note entries must show author name,
* note entries must show timestamp,
* adding a note must be available to all users,
* editing and deleting a note must be available only to the note author,
* notes should behave like an operational log on the card, not a hidden textarea.

Card workflow behavior:

* `Комментарии` are static equipment-level information and do not disappear when process state changes,
* `Вложения` should accept files, PDFs, photos, and related documents,
* the old `neighboring equipment` block should be replaced by `Вложения`,
* the card should expose action buttons to:
  * send any equipment to repair,
  * send `SI` equipment to verification,
* when active processes exist, the card may show two independent panels at once:
  * `Прибор находится в ремонте`,
  * `Прибор находится в поверке`.

Process panel behavior:

* each active process panel should behave like a compact messenger-style thread,
* expandable process panels and secondary detail blocks should be collapsed by default and opened explicitly by the user,
* users can add messages with author and timestamp,
* messages may include inline attachments,
* the equipment card verification panel should keep the dialog and compact current-state summary,
* milestone date editing belongs to the dedicated `/verification/si` page inside an expandable verification record,
* on the collapsed verification panel the user should see the current derived state instead of only the send date,
* collapsed verification and repair records should prefer one process-strip that places milestone events directly on a horizontal line; the strip should not be wrapped in a heavy outer card,
* the strip should render as one clean axis with hover/focus tooltips for events and deadline markers instead of permanently expanded cards,
* the strip should also show colored intervals between completed milestones; completed operations should be visible as green segments with hover duration, while overdue intervals should be visible as red segments with explicit reason on hover,
* verification strips may use milestone-progress only, while repair strips should treat the repair-production deadline as an internal milestone and use a longer baseline window for the whole process rather than ending the axis at the `100-day` repair deadline,
* the repair send modal should ask for route fields such as city and destination, not repair organization,
* the first repair message with attachments may be created during send-to-repair, but it is optional,
* after completion, the active process panel is replaced by an archive record with ZIP download action,
* archive entries on `/verification/si` may be expanded to show informative details such as route, milestone dates, and grouped SI membership,
* one grouped batch should display one shared dialog thread for every included card,
* stage forms must reject impossible chronology immediately in the UI: a later milestone cannot be filled before the previous one exists, and a stage date cannot be earlier than the previous completed stage.

### `/verification/si`

Dedicated SI verification page or focused workspace.

Must include:

* SI-only verification table or work queue,
* verification details,
* Arshin sync actions,
* filters for expiration and sync state,
* indicator for uncertain matches,
* manual review workflow for problematic records,
* link to the related equipment card,
* external Arshin link when available.

This page should be the place for SI-specific calculated columns, for example:

* verification date,
* valid until,
* remaining days,
* overdue state,
* other derived SI values similar to the `metroloGet` approach.

Workflow rules:

* verification is independent from repair,
* only `SI` items can enter verification,
* grouped verification is allowed only when all selected items are `SI`,
* completion should move verification panels into archive state,
* grouped verification membership may be adjusted later,
* milestone editing must preserve chronological order.

Adding `SI` behavior:

* `SI` records should be onboarded from Arshin search rather than hand-entered field by field,
* detailed `vri_id` enrichment should be part of the standard `SI` creation flow,
* updating an existing `SI` after a new certificate appears should be possible by entering the certificate number only.

### `/repairs`

Dedicated repair page.

Must include:

* active repairs tab,
* archived repairs tab,
* stage view,
* overdue markers,
* search,
* filter by stage and repair organization.

Workflow rules:

* repair is available for all equipment categories,
* grouped repair may include both `SI` and non-`SI`,
* repair completion is available only after payment,
* grouped repair completion should also be supported,
* after completion, the active repair panel on the card becomes a compact archive record,
* grouped repair membership may be adjusted later,
* repair milestone editing must preserve chronological order.

### Excel export

List pages should support Excel export of the current filtered result.

Later extension:

* a user should also be able to upload an Excel file with certificate numbers and trigger bulk SI onboarding from Arshin.
* this bulk import should live in the equipment registry workspace for the currently selected folder,
* after upload, the UI should show a compact row-level import report with created, skipped, and error results.

Applies to:

* equipment registry,
* repairs,
* SI verification registry.

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
* create-user action,
* reset-password action,
* active/inactive state controls,
* visibility of whether the user must change password on next login,
* temporary-password reveal/copy block shown only to the administrator who created or reset the user,
* simple permission-management workflow,
* navigation from a user row to a dedicated user-detail page.

If the administrator opens their own record from this area,
the UI should route them to `/profile` rather than showing a duplicate admin-view page.

### `/admin/users/:id`

Administrator-only user-detail page.

Must include:

* account status,
* phone,
* organization,
* position,
* facility,
* quick navigation back to the main user list.

### `/login`

Simple login page.

Must include:

* minimal form,
* clear submit action,
* no unnecessary marketing content.

### `/profile`

Simple profile/account page.

Must include:

* basic account info,
* editable phone field,
* editable organization field,
* editable position field,
* editable facility field,
* role or permission visibility when relevant,
* password change form,
* visual handling for first-login forced password change state,
* account actions kept simple.

There is no public self-service registration page in MVP.
User accounts are created by administrators from `/admin/users`.

---

## Main Components

Suggested components:

### Layout

* `AppShell`
* `Sidebar`
* `Topbar`
* `PageHeader`
* `AccountMenu`
* `AuthLayout`
* `Modal`
* `ThemeSwitcher`

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
* `ProcessTimelineStrip`
* `RepairStageBadge`
* `DeadlineBadge`
* `OverdueIndicator`

### Verification

* `VerificationCard`
* `VerificationSummary`
* `ProcessTimelineStrip`
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
* `CreateUserDialog`
* `TemporaryPasswordDialog`
* `ForcePasswordChangeGate`
* `UserDetailsView`

---

## Design and UX Guidelines

### General style

Use a neutral professional enterprise style.
The app should look serious, modern, and clean.

Visual consistency is mandatory:
- equal-level UI blocks must look equal-level,
- equal-purpose controls must share the same dimensions and component pattern,
- differences should communicate meaning, not inconsistency,
- if a new screen introduces a button, compact action, chip, modal footer, or nested frame, it must reuse the established frontend pattern instead of inventing a new one.

### Visual priorities

User must instantly notice:

* current stage,
* overdue state,
* verification validity,
* where the equipment is now,
* required next action,
* active repair state in the registry row when applicable.

### Tables

Tables must be:

* dense but readable,
* filterable,
* sortable,
* with sticky headers if practical,
* responsive enough for common desktop sizes.

The layout should preserve as much horizontal space as possible for the table area.
Supporting navigation or filters must not consume excessive width when a table is the main task focus.

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

Profile display blocks should remain compact and readable:

* avoid oversized cards for short account metadata,
* prefer tight row-based presentation for user profile details,
* support long values such as email, position, or facility with clean wrapping.

Form and modal action rules:

* confirm/cancel/save actions must remain visually synchronized when they belong to one action group,
* neighboring buttons inside one form or modal should differ by semantic color, not by arbitrary size mismatch,
* repeated dialog structures should reuse the same modal and action-button primitives,
* nested structures should follow the same depth system across the app so that inner frames, message bubbles, and inline controls become darker or denser in a predictable way.

---

## Dynamic Form Rules

### Equipment form

Base fields for all equipment:

* object name
* equipment type
* name
* modification
* serial number
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

Attachments area:

* replace neighboring equipment block with `Вложения`,
* support card-level files and process-linked files,
* show uploaded items in a clear operational list.

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

The primary repair stage view should be a vertical operational table similar to the Excel MVP.

Each stage row should show:

* stage name,
* actual date,
* deadline,
* completed / not completed state.

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
* delete folders,
* create groups inside folders,
* edit groups,
* delete groups,
* create equipment,
* edit equipment,
* delete equipment,
* browse equipment by selected folder and group,
* support search and filtering in list views,
* support patterns similar to `../metrologet` without copying its UI directly.

Extra behavior:

* deleting a folder must explicitly warn that nested groups and equipment may also be removed,
* deleting a group should be confirmed and should be understandable from the UI,
* action labels should stay compact and not overload the registry table.

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

Additional shell styling rules:

* the left sidebar is the only primary section navigation,
* the sidebar must support a collapsed icon-only mode,
* the sidebar collapse control should live inside the sidebar itself,
* the top bar title should stay short: `metroLog`,
* the shell should support theme selection,
* theme selection should be restored from the authenticated user's profile, not only from local browser state.
* `/settings` should let the user toggle which theme presets remain visible in the top-right switcher.
* the default visible presets should be `light`, `gray`, and `dark`, while extra presets may be inspired by common GTK/NVim palettes.
* recurring manual fields should prefer folder-scoped suggestions over repeated blank typing.

Theme tuning rules:

* `light` should be a calm light-gray workspace rather than a harsh bright white theme,
* `gray` should stay denser and darker than `light`, but not collapse into the dark theme,
* nested bordered blocks should not arbitrarily shift hue; they should primarily read through stepwise darkening by depth.

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
* search and filters for repair lists,
* process dialog panel with attachments,
* grouped repair actions,
* archive record after completion.

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
* Arshin detail link and `vri_id`-based detail fetch support,
* process dialog panel with attachments,
* grouped verification actions,
* archive record after completion.

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
* confirmation dialogs for destructive actions,
* responsive polishing,
* clear page-level navigation between functional areas.

---

## Stage 7 - Auth and User Administration

* login integration,
* profile page wiring,
* protected routes,
* administrator-only user management page,
* user list and filters,
* role assignment controls,
* admin-created users,
* temporary password issuance,
* forced password change on first login.

---

## Authentication and Permissions

Authentication is a later phase,
but the frontend should be ready for:

* user login,
* profile page,
* admin-only user management page,
* role-based page visibility,
* role-based action visibility,
* protected routes for operational sections.

MVP auth assumptions:

* users are created by administrators,
* no public registration UI is exposed,
* new users receive a temporary password from the administrator,
* first login routes the user into mandatory password change before normal work.

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
* equipment details card reachable to all roles from the equipment registry,
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
