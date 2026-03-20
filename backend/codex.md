# Backend Codex

## Goal
Build the FastAPI backend for equipment accounting, repair and movement lifecycle tracking, event logging, and Arshin integration.

The backend is the source of truth for:
- entities and relations,
- domain rules,
- stage calculation,
- deadline calculation,
- overdue calculation,
- validation,
- external integration with Arshin,
- consistent movement logic for both SI and non-SI equipment.

---

## Tech Stack
- FastAPI
- SQLAlchemy 2.x
- PostgreSQL
- Alembic
- Pydantic v2
- httpx
- Redis
- RQ or Celery
- pytest

---

## Backend Architecture Principles

### 1. Layered structure
Use clear separation of concerns:
- API layer
- schemas
- services
- repositories
- models
- integrations
- tasks
- utilities

### 2. Thin routes
FastAPI endpoints should be thin.
Business logic belongs to services, not route handlers.

### 3. Explicit service layer
All non-trivial logic must go through services:
- equipment service,
- repair service,
- event log service,
- dashboard service,
- Arshin sync service.

### 4. Repository discipline
Database access should be structured and not randomly mixed across the codebase.

### 5. Derived fields on backend
Computed values must be produced by backend:
- current stage,
- current location,
- deadlines,
- overdue days,
- active repair status,
- verification summary for SI.

### 6. Workbook-aligned functional areas
Backend API structure should support frontend navigation by dedicated functional areas:
- dashboard,
- equipment,
- SI verification,
- repairs,
- event log,
- reference/settings data later.

---

## Suggested Folder Structure

```text
backend/
  app/
    api/
      v1/
    core/
    db/
    models/
    schemas/
    services/
    repositories/
    integrations/
    tasks/
    utils/
    main.py
  alembic/
  tests/
  pyproject.toml
```

---

## Main Entities

### EquipmentFolder

Top-level organizational container for large equipment registries.

Fields:

* id
* name
* description
* sort_order
* created_at
* updated_at

### EquipmentGroup

Logical group inside a folder.

Fields:

* id
* folder_id
* name
* description
* sort_order
* created_at
* updated_at

### EquipmentNote

Operational note entry attached to an equipment card.

Fields:

* id
* equipment_id
* author_user_id nullable until auth is implemented
* author_display_name
* note_text
* created_at
* updated_at optional

### EquipmentAttachment

File attachment visible from the equipment card.

Fields:

* id
* equipment_id
* repair_id nullable
* verification_process_id nullable
* uploaded_by_user_id nullable until auth is fully enforced
* file_name
* file_mime_type
* file_size
* storage_path
* created_at

### EquipmentProcessMessage

Messenger-style process message linked to repair or verification workflow.

Fields:

* id
* equipment_id
* repair_id nullable
* verification_process_id nullable
* author_user_id nullable until auth is fully enforced
* author_display_name
* message_text
* created_at

### VerificationProcess

Operational verification workflow instance for `SI` equipment.

Fields:

* id
* equipment_id
* batch_id nullable
* started_at
* completed_at nullable
* archived_at nullable
* archive_zip_path nullable
* is_active
* created_at
* updated_at

### User

Internal authenticated user managed by administrators.

Fields:

* id
* first_name
* last_name
* patronymic optional
* email
* password_hash
* role
* is_active
* must_change_password
* password_changed_at optional
* phone optional
* organization optional
* position optional
* facility optional
* created_at
* updated_at

### Equipment

Stores common equipment data.

Fields:

* id
* object_name
* equipment_type
* name
* modification
* serial_number
* folder_id
* manufacture_year
* status
* group_id nullable
* current_location_manual
* created_at
* updated_at

Registry behavior:

* the common equipment registry must contain both SI and non-SI records in one structure,
* every equipment row belongs to one explicit category from `SI`, `IO`, `VO`, or `OTHER`,
* `SI` is separate because only it later participates in the Arshin workflow,
* the common equipment list should expose only basic operational fields,
* inventory number is not part of the backend equipment contract,
* equipment must belong to a folder even when no group is assigned,
* detailed SI verification payload must not overload the common equipment registry response,
* SI-specific calculated verification data belongs primarily to dedicated SI verification endpoints and detailed card responses.

### SIVerification

One-to-one with Equipment for SI only.

Fields:

* id
* equipment_id
* arshin_vri_id
* arshin_url
* arshin_mi_type_reg_number
* mi_type_name
* mi_type_symbol
* certificate_number
* verification_date
* valid_until
* verifier_name
* verification_type
* owner_name
* is_usable
* passport_mark
* device_mark
* verification_document
* match_status
* match_flags_json
* manual_review_required
* manual_review_status
* manual_review_comment
* raw_payload_json
* synced_at
* created_at
* updated_at

### Repair

Tracks repair workflow for equipment.

Fields:

* id
* equipment_id
* route_city
* route_destination
* sent_to_repair_at
* repair_deadline_at
* sent_from_repair_at
* sent_from_irkutsk_at
* arrived_to_lensk_at
* registration_deadline_at
* actually_received_at
* control_start_at
* control_deadline_at
* incoming_control_at
* payment_start_at
* payment_deadline_at
* paid_at
* current_stage_cached optional
* created_at
* updated_at
* closed_at optional

Repair creation rules for the equipment card:

* repair organization field is not required in MVP,
* operator specifies route fields such as city and destination instead,
* operator may optionally attach the first repair dialog message and files during creation,
* the repair may also be created without an initial message and populated later through the dialog,
* repair milestones must be stored in chronological order; backend should reject missing-gap and reverse-date updates with explicit validation errors.

### EventLog

Stores timeline events.

Fields:

* id
* equipment_id
* repair_id nullable
* event_type
* event_date
* event_title
* event_payload jsonb
* created_at

---

## Enums

### EquipmentType

* SI
* IO
* VO
* OTHER

### EquipmentStatus

* IN_WORK
* IN_VERIFICATION
* IN_REPAIR
* WRITTEN_OFF

### UserRole

Initial planned values:

* ADMINISTRATOR
* MKAIR
* CUSTOMER

### Auth-related entities planned next

The auth subsystem should support an internal admin-managed account lifecycle.

Required capabilities:

* bootstrap administrator creation,
* admin-created users,
* temporary password issuance,
* forced password change on first login,
* change-password action for authenticated users,
* admin-triggered password reset that issues a new temporary password,
* optional later delivery channels for credentials or recovery, such as email or Telegram.

### RepairStage

Suggested values:

* IN_WORK
* SENT_TO_REPAIR
* SENT_FROM_REPAIR
* IN_TRANSIT_IRKUTSK_LENSK
* ARRIVED_TO_LENSK
* AWAITING_RECEIVING
* RECEIVED
* INCOMING_CONTROL
* PAYMENT
* COMPLETED

### EventType

Suggested values:

* EQUIPMENT_CREATED
* EQUIPMENT_UPDATED
* EQUIPMENT_MOVED
* EQUIPMENT_NOTE_UPDATED
* FOLDER_CREATED
* FOLDER_UPDATED
* GROUP_CREATED
* GROUP_UPDATED
* REPAIR_CREATED
* REPAIR_UPDATED
* REPAIR_STAGE_CHANGED
* VERIFICATION_SYNCED
* VERIFICATION_UPDATED
* VERIFICATION_REVIEW_REQUESTED
* VERIFICATION_REVIEW_RESOLVED

---

## Core Domain Rules

### Rule 1 - SI-specific verification

Only SI equipment can have verification data in `SIVerification`.

Validation:

* if equipment type is SI, verification block is allowed,
* if equipment type is not SI, SI verification data must not be created unless explicitly supported later.

### Rule 1.2 - SI onboarding through Arshin

`SI` equipment creation must use Arshin-assisted onboarding.

Rules:

* non-`SI` equipment may be created through standard manual create flow,
* `SI` equipment creation should start from Arshin search parameters rather than a plain manual form,
* the resulting equipment and SI verification data should be populated from Arshin response data,
* the onboarding search should work from certificate number without forcing an explicit year in the UI,
* after the user selects an Arshin search result, the backend should support detailed enrichment by `vri_id`,
* the stored `SI` profile should preserve both short search payload and detailed `vri_id` payload,
* the detailed card for `SI` should expose the richer detail payload,
* later refresh by new certificate number should update the same `SI` card data without recreating the equipment item.

### Rule 1.0 - Shared registry and dedicated SI workspace

The backend must support two different read models:

* a common equipment registry view for all equipment,
* a dedicated SI verification view for SI-focused calculations and deadlines.

Expected difference:

* the common registry response stays lean and browsing-oriented,
* the SI verification response may include calculated columns such as verification date, valid until, remaining days, overdue state, and similar derived SI values.

### Rule 1.1 - Shared organization hierarchy

SI and non-SI equipment must be stored in the same folder/group hierarchy.

Validation:

* folders are top-level containers,
* groups belong to folders,
* equipment may belong to a group,
* folder membership is derived through the group relation,
* the hierarchy must not be limited only to SI records.

### Rule 2 - One active repair

Each equipment item can have at most one active repair.
A repair is active until it is completed or explicitly closed.

### Rule 2.1 - Independent repair and verification processes

Repair and verification are independent processes.

Rules:

* repair is allowed for all equipment categories,
* verification process is allowed only for `SI`,
* one `SI` item may have active repair and active verification at the same time,
* detailed equipment responses must expose these states independently,
* one process must not overwrite or hide the other in backend state,
* active repair must affect registry-facing status so that the item is shown as `IN_REPAIR`,
* if both active processes are absent, stale transient statuses must be normalized back to `IN_WORK`,
* if verification closes while repair is still active, the equipment status must remain `IN_REPAIR`.

### Rule 2.1.1 - One active verification

Each `SI` item can have at most one active verification.
The service layer must reject attempts to start a second active verification for the same item, just as it rejects a second active repair.

### Rule 2.2 - Folder-scoped manual suggestions

Verification must support both:
- a fixed milestone tracker with explicit dates for movement and handoffs,
- a free dialog thread with messages and attachments.

Backend rules for the milestone tracker:
- milestone dates belong to the active verification process record,
- the current short verification state is derived from the latest completed milestone,
- updating a milestone date must append a system message to the verification dialog,
- milestone tracking must not replace the free dialog,
- milestone editing is primarily handled from the dedicated verification workspace, while the equipment card shows only compact current-state summary plus dialog,
- milestone dates must remain chronological; backend should reject missing-gap and reverse-date updates with explicit validation errors.

### Rule 2.3 - Folder-scoped manual suggestions

The backend should expose folder-local suggestion lists for recurring manual values.

Examples:

* object names,
* current locations,
* repair route cities,
* repair destinations.

### Rule 3 - Derived deadlines

Repair deadlines must be calculated automatically.

Formulas:

* `repair_deadline_at = sent_to_repair_at + 100 days`
* `registration_deadline_at = arrived_to_lensk_at + 5 days`
* `control_deadline_at = actually_received_at + 40 days` or fallback from registration deadline
* `payment_deadline_at = incoming_control_at + 70 days` or fallback from control deadline

### Rule 4 - Current stage

Current stage must be determined from milestone fields, not manually typed.

### Rule 5 - Event log generation

Whenever relevant repair milestone fields change, event log records must be created automatically.

Relevant fields:

* sent_to_repair_at
* sent_from_repair_at
* sent_from_irkutsk_at
* arrived_to_lensk_at
* actually_received_at
* incoming_control_at
* paid_at

### Rule 6 - Overdue calculation

Overdue days must be available in API for each relevant stage.

### Rule 7 - Shared movement workflow

The movement and repair workflow must be understandable and usable
for SI, IO, VO, and OTHER equipment categories.

Validation and behavior:

* SI equipment uses the common movement workflow plus SI-specific verification features,
* non-SI equipment uses the same movement workflow without SI-specific verification requirements,
* backend must not couple repair lifecycle logic only to SI scenarios.

### Rule 8 - Uncertain Arshin matches

Arshin sync results may be uncertain and must support manual verification.

Requirements:

* uncertain match state must be represented explicitly in backend data,
* uncertain records must be queryable as a review queue,
* the system must preserve Arshin identifiers and source links for manual checking,
* manual review outcome must be stored and auditable,
* if detailed Arshin data is needed, the system may perform a second lookup by `vri_id`.

### Rule 9 - Equipment notes

Each equipment card must support structured operational note entries.

Requirements:

* notes are stored as separate entries linked to equipment,
* each note entry must include author name,
* each note entry must include timestamp,
* note additions should be logged in the event log,
* note history must be available in detailed equipment responses,
* all authenticated user roles may add note entries,
* only the note author may edit or delete a note entry.

### Rule 9.1 - Static comments vs process dialogs

The equipment card must separate static comments from process-specific communication.

Rules:

* equipment comments are static card-level data,
* static comments do not reset when repair or verification state changes,
* process messages belong to repair or verification workflows,
* process messages behave like a threaded log with author and timestamp.

### Rule 9.2 - Attachments

The equipment card must support file attachments.

Rules:

* attachments may belong to the equipment card in general,
* attachments may also belong to a specific repair or verification workflow,
* supported files include documents, PDFs, photos, and related materials.

### Rule 9.3 - Grouped process batches

The backend must support grouped repair and verification actions.

Rules:

* mixed selection of `SI` and non-`SI` may create grouped repair only,
* grouped verification is allowed only when every selected item is `SI`,
* grouped process metadata must remain visible from each included equipment card,
* one grouped batch uses one shared dialog thread,
* equipment may later be added to or removed from an existing grouped batch,
* removing one member from a grouped batch should detach it into its own still-active standalone process instead of cancelling the process outright,
* when a member is detached, it should retain a cloned snapshot of the shared dialog history accumulated while it belonged to the batch.

### Rule 9.4 - Process completion and archive

Completed processes must move into archive state.

Rules:

* repair completion is valid only after payment is complete,
* grouped repair or grouped verification may also be completed in bulk,
* after completion, active process data becomes archived,
* the card must expose archive metadata and ZIP download link for completed processes,
* ZIP contents should include only the process dialog and its attachments,
* the generated archive ZIP should contain `dialog.txt` plus a `files/` folder,
* archive list entries may remain compact initially, but backend responses must expose enough data for an expandable archive view with grouped membership and milestone dates.
* closing verification must also synchronize the equipment status so that the equipment does not stay in `IN_VERIFICATION` after the active verification is archived.

### Rule 10 - Event log as audit trail

The event log should behave as an application-level audit log.

It must capture at least:

* create actions,
* update actions,
* delete or archive actions when supported,
* folder and group structure changes,
* equipment note updates,
* verification sync and manual review actions,
* repair changes.

Current implementation baseline:

* `event_logs` is a dedicated table,
* rows store category, action, title, optional description, actor snapshot, optional equipment snapshot, optional folder snapshot, optional `batch_key`, and timestamps,
* the first production slice already logs core folder, equipment, repair, verification, message, attachment, comment, and Arshin-refresh actions,
* list API must support free-text search plus category and period filters.

### Rule 11 - Initial access matrix

Until a more detailed RBAC model is introduced, use this baseline:

* `ADMINISTRATOR` and `MKAIR` can edit equipment records,
* `ADMINISTRATOR` and `MKAIR` can run SI sync/update actions,
* `ADMINISTRATOR` and `MKAIR` can update repair state dates,
* `ADMINISTRATOR` and `MKAIR` can view the event log,
* only `ADMINISTRATOR` can access user management and assign rights,
* all roles can view equipment, repairs, SI pages, and equipment detail cards,
* all roles can add equipment note entries.

### Rule 12 - List endpoints must be filterable

Endpoints that return operational lists should support search and filtering
appropriate to their domain.

At minimum:

* equipment lists support search and structural filters,
* SI verification lists support search and review-related filters,
* repair lists support active/archive and stage filters,
* event log lists support event-type and period filters.

Current route baseline:

* `GET /api/v1/events`
  * `query`
  * `category`
  * `date_from`
  * `date_to`
  * `limit`

---

## API Design

All endpoints under:
`/api/v1`

---

## Equipment Endpoints

### `GET /api/v1/equipment`

List equipment with filters, sorting and pagination.

Supported query params:

* folder_id
* group_id
* equipment_type
* status
* query

Response should include:

* common equipment fields,
* current location,
* status,
* clear equipment category marker,
* only the minimum SI summary needed for registry browsing.

### `POST /api/v1/equipment`

Create new equipment.

Behavior:

* intended primarily for non-`SI` equipment manual creation.

### `GET /api/v1/equipment/{id}`

Get detailed equipment card.

Response should include:

* equipment main data,
* verification summary or detail when applicable,
* active repair summary when applicable,
* active verification summary when applicable,
* note entries with author and timestamps,
* equipment-level attachments,
* active process messages and process attachments,
* archive records for completed repair and verification processes.

### `PATCH /api/v1/equipment/{id}`

Update equipment.

### `DELETE /api/v1/equipment/{id}`

Delete equipment by id.

Current behavior:

* deletion is hard delete,
* UI is expected to ask for explicit confirmation before calling the endpoint,
* soft delete may be introduced later if audit requirements grow.

### `GET /api/v1/equipment/{id}/attachments`

List card-level and process-linked attachments visible from the equipment card.

### `POST /api/v1/equipment/{id}/attachments`

Upload card-level attachment.

### `GET /api/v1/equipment/folders`

List folders with summary counters.

### `POST /api/v1/equipment/folders`

Create folder.

### `PATCH /api/v1/equipment/folders/{id}`

Update folder.

### `DELETE /api/v1/equipment/folders/{id}`

Delete folder.

Current behavior:

* deleting a folder removes all equipment that belongs to that folder,
* nested groups disappear with the folder,
* UI is expected to warn clearly before executing this action.

### `GET /api/v1/equipment/groups`

List groups, optionally filtered by folder.

### `POST /api/v1/equipment/groups`

Create group inside a folder.

### `PATCH /api/v1/equipment/groups/{id}`

Update group.

### `DELETE /api/v1/equipment/groups/{id}`

Delete group.

Current behavior:

* equipment is not deleted with the group,
* equipment previously linked to that group becomes ungrouped inside the same folder,
* UI is expected to ask for confirmation before the request.

---

## Repair Endpoints

### `GET /api/v1/repairs`

List repairs with filters.

Filters:

* equipment_id
* lifecycle_status active|archived
* stage
* overdue_only
* repair_org_name
* search
* page
* page_size

### `POST /api/v1/repairs`

Create repair for equipment.

Must validate:

* equipment exists,
* no other active repair exists.

Batch behavior:

* grouped repair creation must support multiple equipment ids,
* grouped repair may include both `SI` and non-`SI`,
* grouped repair should persist `batch_key` and `batch_name`,
* grouped repair archive export should aggregate the shared batch dialog and its files.

### `GET /api/v1/repairs/{id}`

Get repair details.

### `PATCH /api/v1/repairs/{id}`

Update repair milestone fields and comments.

### `POST /api/v1/repairs/{id}/close`

Optional endpoint if explicit close is needed.

Close validation:

* repair completion is allowed only after payment is complete.

### `POST /api/v1/repairs/batch`

Create grouped repair for multiple selected equipment items.

The batch supports later membership changes through the dedicated batch-items endpoint.

### `PATCH /api/v1/repairs/batch/{batch_id}`

Update milestone fields for the whole active grouped repair.

### `PATCH /api/v1/repairs/batch/{batch_id}/items`

Add or remove equipment items from grouped repair batch.

### `POST /api/v1/repairs/batch/{batch_id}/close`

Complete grouped repair batch when business rules allow it.

---

## Dashboard Endpoints

### `GET /api/v1/dashboard/summary`

Return counters:

* total equipment,
* in repair,
* overdue repairs,
* incoming control stage count,
* payment stage count,
* expiring verifications.

### `GET /api/v1/dashboard/overdue`

Return overdue records with short summaries.

### `GET /api/v1/dashboard/upcoming`

Return upcoming deadlines.

### `GET /api/v1/dashboard/recent-events`

Return latest event log items.

---

## Event Log Endpoints

### `GET /api/v1/logs/events`

Global event log.

Expected filters:

* equipment_id
* repair_id
* event_type
* date_from
* date_to
* search

### `GET /api/v1/equipment/{id}/timeline`

Equipment timeline:

* equipment events,
* repair events,
* verification sync events.

### `GET /api/v1/equipment/{id}/notes`

Optional read endpoint if notes editing is separated in UI.

### `POST /api/v1/equipment/{id}/notes`

Add equipment note entry.

### `PATCH /api/v1/equipment/{id}/notes/{note_id}`

Update note entry text. Allowed only for the note author.

### `DELETE /api/v1/equipment/{id}/notes/{note_id}`

Delete note entry. Allowed only for the note author.

### `GET /api/v1/equipment/{id}/process-messages`

List repair and verification dialog messages for the equipment card.

### `POST /api/v1/equipment/{id}/process-messages`

Create process dialog message with optional attachments.

---

## User Management Endpoints

### `GET /api/v1/users`

Admin-only user list.

Expected filters:

* search
* role
* is_active
* page
* page_size

### `GET /api/v1/users/{id}`

Admin-only user details.

Response should include:

* core account fields,
* phone,
* organization,
* position,
* facility,
* `must_change_password`.

### `POST /api/v1/users`

Admin-only user creation endpoint.

Must support:

* display name,
* login email or username depending on chosen auth identifier,
* initial role,
* temporary password generation or explicit temporary password input,
* `must_change_password` flag set to true.

### `PATCH /api/v1/users/{id}`

Admin-only update endpoint for user state and permissions.

Must support:

* display name updates,
* role changes,
* activation/deactivation,
* optional profile metadata updates.

### `PATCH /api/v1/auth/me`

Authenticated self-profile update.

Must support:

* phone updates in free text format,
* organization updates,
* position updates,
* facility updates.
* shell theme preference updates bound to the authenticated user.
* persisted list of enabled shell themes that controls which presets appear in the top-right switcher.

### `POST /api/v1/users/{id}/reset-password`

Admin-only password reset endpoint.

Must:

* issue a new temporary password,
* set `must_change_password` to true,
* return the temporary password payload only to the administrator performing the action.

### `POST /api/v1/users/{id}/roles`

Admin-only role assignment endpoint.

### `DELETE /api/v1/users/{id}/roles/{role}`

Admin-only role removal endpoint if supported by the chosen model.

---

## Arshin Endpoints

### `POST /api/v1/arshin/search`

Search verification data by supplied parameters.

Possible input:

* certificate number,
* verification date,
* reg number + serial number,
* other supported fields depending on integration.

Expected search behavior:

* support the multi-parameter Arshin search patterns already proven in `../metroSearch`,
* support first-stage lookup by certificate number and year,
* support second-stage lookup by instrument parameters such as registration number, title, notation, modification, serial number, and year,
* preserve enough metadata to decide whether the match is reliable.

### `POST /api/v1/arshin/sync/{equipment_id}`

Sync SI verification data for one equipment item.

### `POST /api/v1/arshin/sync-bulk`

Bulk sync for filtered SI records.

### `GET /api/v1/arshin/task/{task_id}`

Task status endpoint if sync runs in background queue.

### `GET /api/v1/verification/si`

List SI equipment with verification and sync status.

Expected filters:

* folder_id
* group_id
* expiring_before
* sync_status
* manual_review_required
* search

Response should include SI-specific calculated fields such as:

* verification date,
* valid until,
* remaining days,
* overdue state,
* related equipment card context.

### `GET /api/v1/verification/si/{equipment_id}`

Get SI verification details including equipment link context.

### `POST /api/v1/verification/si/{equipment_id}/review`

Save manual review result for uncertain or problematic SI records.

### `POST /api/v1/verification/si/{equipment_id}/start`

Start verification workflow for one `SI` item.

### `POST /api/v1/verification/si/batch`

Start grouped verification workflow for selected `SI` items.

The batch supports later membership changes through the dedicated batch-items endpoint.

### `PATCH /api/v1/verification/si/batch/{batch_id}/items`

Add or remove equipment items from grouped verification batch.

### `POST /api/v1/verification/si/{equipment_id}/complete`

Complete verification workflow for one `SI` item and archive it.

### `POST /api/v1/verification/si/batch/{batch_id}/complete`

Complete grouped verification workflow and archive it.

---

## Export Endpoints

Operational list endpoints should support Excel export based on current filters.

Later extension:

* support bulk SI onboarding from an uploaded Excel file with certificate numbers,
* for each row, resolve the Arshin record and create the matching SI equipment item when the match is accepted,
* bulk import should return a row-level report with created, skipped, and error states rather than failing as one opaque batch.

### `GET /api/v1/equipment/export/xlsx`

Export filtered equipment registry to Excel.

### `GET /api/v1/equipment/repairs/export/xlsx`

Export filtered repairs list to Excel.

### `GET /api/v1/equipment/verifications/export/xlsx`

Export filtered SI verification list to Excel.

### `GET /api/v1/arshin/vri/{vri_id}`

Fetch detailed Arshin data by `vri_id`.

Use this when the card or manual review workflow needs full detail,
including etalon-related information.

### `POST /api/v1/equipment/si/from-arshin`

Create `SI` equipment item from selected Arshin search result and its detailed `vri_id` enrichment.

### `POST /api/v1/verification/si/{equipment_id}/refresh-by-certificate`

Refresh existing `SI` verification data by entering a new certificate number.

Expected behavior:

* backend re-runs Arshin lookup,
* updates card-visible SI data for the existing equipment record,
* preserves auditability of the refresh action.

---

## Schemas

Use Pydantic v2 schemas split into:

* create schemas,
* update schemas,
* read schemas,
* list item schemas,
* summary schemas.

Suggested groups:

* equipment.py
* equipment_note.py
* repair.py
* verification.py
* dashboard.py
* event_log.py
* arshin.py

Avoid one giant schema file.

---

## Services

Suggested service modules:

* `equipment_service.py`
* `equipment_structure_service.py`
* `equipment_note_service.py`
* `user_service.py`
* `repair_service.py`
* `verification_service.py`
* `dashboard_service.py`
* `event_log_service.py`
* `arshin_sync_service.py`

Responsibilities:

### Equipment service

* create/update equipment,
* validate equipment type constraints,
* read details,
* list with filters.

### Equipment note service

* add note entries,
* validate author metadata,
* return note history in correct order,
* create note-related event log rows.

### User service

* create users with temporary passwords,
* list users,
* read user details,
* assign roles,
* update permission-related state,
* reset passwords by issuing new temporary passwords,
* enforce first-login password change behavior,
* enforce admin-only access to user management,
* expose self-profile metadata updates for the authenticated user.

### Repair service

* create repair,
* update milestones,
* compute deadlines,
* compute stage,
* compute overdue,
* enforce one-active-repair rule,
* separate active and archived repairs in list responses.

### Event log service

* generate events,
* create timeline records,
* normalize event titles and payloads.

### Verification service

* create/update SI verification records,
* map synced data to internal model.

### Arshin sync service

* call integration client,
* normalize external response,
* update verification data,
* create event log rows,
* support single and bulk sync,
* flag uncertain matches,
* preserve `vri_id` and Arshin link,
* support detailed lookup by `vri_id` when needed.

### Dashboard service

* summary counters,
* overdue data,
* upcoming deadlines,
* recent changes.

### Equipment structure service

* create/update/delete folders,
* create/update/delete groups,
* create/update/delete equipment,
* list hierarchy,
* provide counters for navigation and drill-down.

---

## Arshin Integration

Create separate integration client:

* `ArshinClient`

Rules:

* no direct integration code inside route handlers,
* use `httpx`,
* support timeout,
* support retry/backoff,
* support normalization to DTOs,
* preserve raw payload if useful for audit/debug.

Suggested integration layers:

* raw client
* DTO mapper
* sync service

The system must tolerate:

* no results,
* multiple results,
* partial data,
* upstream errors,
* invalid date formats,
* temporary network failures.

### Local reference implementations

If Arshin behavior or integration details are unclear, inspect these sibling repositories first:

* `../metrologenerator/app/services/arshin_client.py`
* `../metrologenerator/app/api/deps.py`
* `../metrologenerator/app/api/routes/arshin.py`
* `../metrologenerator/tests/test_arshin_service.py`
* `../metrologenerator/tests/test_arshin_routes.py`
* `../search_docnum/src/services/arshin_client.py`
* `../search_docnum/tests/unit/test_arshin_client.py`
* `../search_docnum/tests/contract/test_arshin_api.py`

Patterns worth reusing:

* `httpx.AsyncClient` with explicit timeout and connection limits,
* configurable base URL and request behavior through settings,
* retry with backoff and jitter for `429`, `500`, `502`, `503`, `504`,
* semaphore or rate-limiter protection for outbound Arshin requests,
* fallback search strategies by certificate number, year, and record parameters,
* uncertain match detection when relaxed matching was needed,
* tolerant parsing of multiple Arshin response shapes and date formats,
* detailed fetch by `vri_id`,
* service and route tests with `respx` for external API mocking.

Default integration assumptions:

* keep Arshin base URL configurable, defaulting to `https://fgis.gost.ru/fundmetrology/eapi`,
* keep Arshin access behind service and integration layers only,
* prefer dependency-injected clients and testable helpers over ad hoc requests inside routes.

---

## Background Tasks

For long sync operations:

* use Redis,
* use RQ or Celery,
* return task id,
* provide status endpoint.

Use background jobs for:

* bulk Arshin sync,
* potentially expensive re-sync operations,
* heavy imports in later phases.

Single quick sync may remain synchronous if performance is acceptable.

---

## Database and Migration Rules

* Every model change requires Alembic migration.
* Avoid destructive migrations without explicit need.
* Add indexes on high-usage filter fields:

  * serial_number
  * equipment_type
  * status
  * object_name
  * valid_until
  * created_at
* Add useful foreign keys and uniqueness constraints where needed.

Suggested constraints:

* active repair uniqueness strategy should be enforced at service level and optionally with DB support if feasible,
* SI verification one-to-one relation with equipment.

---

## Testing Requirements

Use pytest.

Must include tests for:

* deadline calculations,
* overdue calculations,
* stage calculation,
* folder/group hierarchy behavior,
* SI validation rules,
* one-active-repair rule,
* event log generation,
* Arshin response parsing,
* uncertain match detection,
* manual review workflow,
* API endpoint happy paths,
* selected validation errors.

Test categories:

* unit tests for calculation helpers,
* service tests for domain rules,
* API tests for contracts.

---

## Logging and Error Handling

Backend must provide:

* structured logs,
* readable validation errors,
* stable API response formats,
* safe handling of third-party failures.

Do not expose raw traceback to frontend.

---

## Security and Future-readiness

MVP auth is internal and administrator-driven.

Required architectural expectations:

* support users with different roles and page/action permissions,
* keep service boundaries suitable for later permission checks,
* avoid designing routes that assume a single unrestricted user type,
* support an admin-only user management interface for assigning and reviewing rights,
* support a bootstrap administrator setup path,
* support `must_change_password` or equivalent first-login enforcement.

Initial target roles:

* `ADMINISTRATOR`
* `MKAIR`
* `CUSTOMER`

Prefer architecture that can be extended later without major rewrites.

---

## Definition of Done

Backend task is complete only when:

* models are added or updated,
* migration exists,
* schemas exist,
* services are implemented,
* routes are connected,
* calculations work,
* tests cover the critical logic,
* response formats are stable.
