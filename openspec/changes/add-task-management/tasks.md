# Tasks

## 1. Data model and migration

- [ ] 1.1 Add `TaskStatus`, `TaskPriority`, `TaskParticipantRole` enums and the ORM models `Task`, `TaskParticipant`, `TaskEquipment`, `TaskMessage`, `TaskMessageAttachment`, `TaskAttachment`, `TaskChecklistItem`, `TaskSubscription` in `backend/app/models/task.py`; export them from `models/__init__.py`; verify `python -c "import app.models"` imports cleanly.
- [ ] 1.2 Add an additive Alembic revision (next free number after the current head; `0050` is taken by `fix-process-stage-duplication`) creating the tables and indexes (`folder_id`, `status`, `due_date`, unique `(task_id, user_id)` on participants/subscriptions); verify `alembic upgrade head` then `alembic downgrade -1` succeeds on the dev database.
- [ ] 1.3 Extend `EventCategory` with `TASK` and confirm no enum schema migration is required; verify `EventCategory.TASK` round-trips through `EventLog` in a unit test.

## 2. Backend core: task CRUD and participants

- [ ] 2.1 Add `backend/app/schemas/task.py` (create/update/read models for task, participant, equipment link, checklist item, message) and verify schema validation with focused unit tests for required `title` and default `priority=NORMAL`.
- [ ] 2.2 Add `TaskRepository` and `TaskService` implementing create, get, list (folder-scoped, paginated), update, archive and close; verify with service-level tests covering create-by-each-role and folder denial returning 404.
- [ ] 2.3 Implement participant management enforcing exactly one `RESPONSIBLE` with N assignees and N observers; verify a test that assigning a second responsible replaces the first and that an observer cannot mutate the task (403).
- [ ] 2.4 Implement equipment linking (0..N) with link/unlink and cascade cleanup when equipment is deleted; verify tests for a task with no equipment, three linked items, and a deleted linked equipment.
- [ ] 2.5 Add `backend/app/api/v1/routes/tasks.py` and register it in `api/v1/router.py`; verify `GET /api/v1/tasks`, `POST /api/v1/tasks`, `GET/PATCH /api/v1/tasks/{id}` respond per the `tasks` capability spec.

## 3. Backend: status lifecycle, attributes and journal

- [ ] 3.1 Implement status transitions (`NEW`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `ARCHIVED`) with a completion timestamp set on `DONE`/`CANCELLED` and cleared on reopen; verify tests for start→finish and reopen.
- [ ] 3.2 Implement priority, kind/category, tags (JSON list) and due-date handling incl. the overdue filter; verify tests for the priority default and the overdue query excluding terminal statuses.
- [ ] 3.3 Write `TASK` journal entries for create, update, assign, status change, comment, attachment and archive, reusing the event service; verify each mutation in 3.1–3.2 produces the expected journal entry.

## 4. Backend: checklists

- [ ] 4.1 Implement checklist item add, rename, reorder, toggle and delete with preserved ordering; verify tests covering add/complete, reorder, and remove-then-order-stable.
- [ ] 4.2 Expose checklist progress as completed/total on task read models; verify a test where 2 of 4 items are done reports `2 of 4`.

## 5. Backend: collaboration

- [ ] 5.1 Implement task messages with `@mentions` and `is_private` visibility (private hidden from customers), reusing the attachment storage rules; verify tests for a customer-visible message, a private note hidden from a customer, and an oversized attachment rejected with 422.
- [ ] 5.2 Implement task-level and message-level attachments with delete-by-author-or-admin; verify tests upload a supported file and assert it is listed and later removable.
- [ ] 5.3 Implement task subscription/unsubscribe; verify a subscriber who is not a participant receives a subsequent task notification, and document the endpoints in the task route module docstring.

## 6. Backend: notifications and reminders

- [ ] 6.1 Enqueue assignment, mention and status-change emails through `notification_service`/RQ respecting `mention_email_notifications_enabled`; verify with worker tests asserting jobs are enqueued for the affected users and skipped when disabled.
- [ ] 6.2 Add the periodic deadline-reminder job selecting non-terminal tasks inside the reminder window with idempotency key `(task_id, reminder_date)`; verify tests for a due task producing one reminder and a `DONE` task producing none, and that a second run the same day is a no-op.

## 7. Frontend: task views

- [ ] 7.1 Add `frontend/src/api/tasks.ts` mirroring the backend contract; verify the module type-checks and its functions match the OpenAPI paths.
- [ ] 7.2 Add `TasksPage` with list and Kanban board views, filters (folder, status, responsible, assignee, priority, due date, equipment) and sorting; verify with component tests that filtering by an assignee and sorting by due date match the `task-board` spec.
- [ ] 7.3 Add the task detail view (participants, equipment links, checklists, discussion, attachments) reusing `Modal`/`AttachmentPreviewList`; verify component tests for participant editing and checklist progress rendering.
- [ ] 7.4 Add drag-and-drop between board columns that persists the status change; verify a test that moving a card from `NEW` to `IN_PROGRESS` calls the status endpoint.
- [ ] 7.5 Add the personal "My tasks" view (responsible/assignee, overdue highlight); verify a test rendering overdue state for a task whose due date is in the past.

## 8. Frontend: integration

- [ ] 8.1 Register `/tasks` and `/tasks/:taskId` in `app/router.tsx` and add the navigation entry in `src/lib/nav.ts` (visible to all roles); verify the menu shows "Задачи" after login and the route resolves.
- [ ] 8.2 Add a "Tasks" section to `EquipmentDetailsPage` listing tasks linked to the instrument; verify a component test with one linked task.
- [ ] 8.3 Add dashboard widgets for the current user's tasks and overdue tasks; verify widget tests for empty and populated states, and update `src/content/user-guide.ru.txt` with a task workflow section.

## 9. Integration and end-to-end checks

- [ ] 9.1 Run `npm run check` (backend lint+tests, frontend lint+tests+build) and fix failures.
- [ ] 9.2 Perform the acceptance pass on Stage via `main`: create a task with equipment and one without, assign a responsible and two assignees, run a checklist to completion, post a comment with a mention, move a card across the board, and confirm the journal records every step.
- [ ] 9.3 Verify scoping end-to-end as an MKAIR user and a CUSTOMER: no tasks leak from denied folders, and a customer cannot edit a task but can comment and attach.
