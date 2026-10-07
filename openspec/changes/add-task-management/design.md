# Design

## Context

See `proposal.md` — Why. The relevant existing constraints:

- Repairs and verifications already establish the pattern this feature should
  follow: a domain model in `app/models/equipment.py`, a large
  `EquipmentService`, a `Repair`/`Verification` table with milestone columns, a
  JSON `custom_stages_json` list, message + message-attachment tables, a
  `_assert_folder_access` scope check, `EventLog` journaling and RQ email jobs.
- Folder scoping is enforced through `users.allowed_folder_ids` (JSON, `None` =
  all folders) with soft 404 denial.
- The frontend is React + TanStack Query + Zustand with a bespoke design system;
  `Modal`, `AttachmentPreviewList`, `ProcessTimelineStrip` and
  `useQueuedAutoSave` are reusable.
- The event journal stores a denormalized `EventCategory`, `equipment_id`,
  `folder_id` and `batch_key`.

## Goals / Non-Goals

**Goals:**

- Add tasks with minimal new concepts by reusing the repair/verification
  machinery (access control, journal, notifications, discussion, attachments).
- Keep tasks fully usable with no equipment attached.
- Keep the query shape bounded: listing tasks must not fan out into N+1 queries.
- Keep `CUSTOMER` read/comment-only and `MKAIR+` authoritative, matching existing
  role semantics.

**Non-Goals:**

- Subtask/task-tree hierarchy, recurring tasks, Gantt or time tracking.
- Cross-folder tasks or a global task pool.
- A generic, customer-configurable workflow engine; statuses are a fixed enum.
- Replacing repairs/verifications with tasks.

## Decisions

### D1: Mirror the repairs/verifications architecture

Create `Task`, `TaskParticipant`, `TaskEquipment`, `TaskMessage`,
`TaskMessageAttachment`, `TaskAttachment`, `TaskChecklistItem`,
`TaskSubscription`, a `TaskService` + `TaskRepository`, `schemas/task.py` and
`routes/tasks.py`, registered in `api/v1/router.py`.

*Alternative:* a generic "work item" abstraction shared by repairs, verifications
and tasks. Rejected — repairs/verifications carry Arshin-specific payloads and
milestone columns; merging them is a migration risk with little near-term gain.

### D2: `tasks.folder_id` is required; equipment is optional

A task always belongs to a folder, which is what drives access control,
dashboard grouping and the journal's `folder_id`. Equipment is attached through
`task_equipment` (0..N).

*Alternative:* allow folderless "global" tasks. Rejected — they would bypass the
soft-404 scoping model and would need a separate permission path.

### D3: One participants table with a role enum

`task_participants(task_id, user_id, role)` with `role ∈ {RESPONSIBLE,
ASSIGNEE, OBSERVER}`. The service enforces exactly one `RESPONSIBLE`.

*Alternative:* `responsible_id`/`assignee_id` columns on `tasks`. Rejected —
  does not scale to multiple assignees or observers and makes history awkward.

### D4: Status and priority are non-native enums

Use `StrEnum` with `native_enum=False` (VARCHAR columns), as elsewhere in the
codebase, so new values do not require PostgreSQL `ALTER TYPE`.

### D5: Tags as a JSON list on the task

Reuse the existing `JSON` column pattern (like `allowed_folder_ids`). *Alternative:*
normalized tag tables. Deferred — v1 has no cross-task tag analytics, and the
JSON LIST LIKE filter is adequate at expected volumes.

### D6: Checklists are rows, not JSON

`task_checklist_items` with `sort_order` and `is_done`, because items are
mutated independently and progress must be queryable. This differs from
repair/verification `custom_stages_json`, which is a small value object edited as
a whole.

### D7: Notifications and reminders reuse RQ

Assignment, mention and status-change notifications enqueue jobs through the
existing `notification_service` and worker, with the same per-user
`mention_email_notifications_enabled` gate. Deadline reminders are a periodic
job that selects tasks whose `due_date` is inside the reminder window and whose
status is not terminal, keyed idempotently by `(task_id, reminder_date)`.

### D8: Permission matrix

| Action | DEVELOPER/ADMIN | MKAIR | CUSTOMER |
|---|---|---|---|
| Create task in allowed folder | yes | yes | yes |
| View tasks | all folders | allowed folders | allowed folders |
| Comment / attach / subscribe | yes | yes | yes |
| Edit task, participants, status | yes | yes | participants & author only |
| See private notes | yes | yes | no |

Enforced by the existing `_assert_folder_access` plus a task-participation check.

### D9: Journal integration

Extend `EventCategory` with `TASK` (`native_enum=False`, so no DB enum
migration) and write entries for create, update, assign, status change, comment,
attachment and archive.

## Risks / Trade-offs

- [N+1 queries when listing tasks with participants and equipment] → load
  participants, equipment and checklist counts with explicit eager loading /
  aggregate subqueries, and cap page size like the existing queues.
- [Reminder jobs re-sent on retries] → idempotency key `(task_id, reminder_date)`
  and a sent-marker row or unique index.
- [JSON tags are not indexed] → acceptable for v1; document the limit and revisit
  if tag-based reporting is needed.
- [Permission drift between tasks and repairs] → share one participation helper
  and cover the matrix with tests.
- [Route/service bloat in `equipment_service.py`] → put task logic in a separate
  `task_service.py`; only register the router in the shared place.

## Migration Plan

1. Add an additive Alembic revision creating the new tables and indexes; no
   data backfill; no changes to existing tables except the `EventCategory`
   value, which needs no schema change (`native_enum=False`).
2. Deploy: backend runs `alembic upgrade head` on start; the frontend ships the
   new routes behind the normal auth guard.
3. Rollback: revert the application image; the new tables are unused by the old
   code and can be dropped manually if required. No existing data is modified.

## Open Questions

- Should the reminder lead time be per-user configurable, or a single global
  setting? Deferrable; the reminder window can start as a global setting.
- Should completing all checklist items auto-suggest (not auto-apply) a status
  change to `DONE`? Deferrable UX detail.
