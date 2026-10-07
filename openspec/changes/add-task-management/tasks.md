# Tasks

## 1. Data model and migration

- [x] 1.1 Add `TaskStatus`, `TaskPriority`, `TaskParticipantRole` enums and the ORM models `Task`, `TaskParticipant`, `TaskEquipment`, `TaskMessage`, `TaskMessageAttachment`, `TaskAttachment`, `TaskChecklistItem`, `TaskSubscription` in `backend/app/models/task.py`; export them from `models/__init__.py`; verify `python -c "import app.models"` imports cleanly.
- [x] 1.2 Add an additive Alembic revision (`0051`, next after `0050`) creating the tables and indexes (`folder_id`, `status`, `due_date`, unique `(task_id, user_id)` on participants/subscriptions); verify `alembic upgrade head` then `alembic downgrade -1` succeeds on the dev database.
- [x] 1.3 Extend `EventCategory` with `TASK` and confirm no enum schema migration is required; verify `EventCategory.TASK` round-trips through `EventLog` in a unit test.

## 2. Backend core: task CRUD and participants

- [x] 2.1 Add `backend/app/schemas/task.py` (create/update/read models for task, participant, equipment link, checklist item, message) and verify schema validation with focused unit tests for required `title` and default `priority=NORMAL`.
- [x] 2.2 Add `TaskRepository` and `TaskService` implementing create, get, list (folder-scoped, paginated), update, archive and close; verify with service-level tests covering create-by-each-role and folder denial returning 404.
- [x] 2.3 Implement participant management enforcing exactly one `RESPONSIBLE` with N assignees and N observers; verify a test that assigning a second responsible replaces the first and that an observer cannot mutate the task (403).
- [x] 2.4 Implement equipment linking (0..N) with link/unlink and cascade cleanup when equipment is deleted; verify tests for a task with no equipment, three linked items, and a deleted linked equipment.
- [x] 2.5 Add `backend/app/api/v1/routes/tasks.py` and register it in `api/v1/router.py`; verify `GET /api/v1/tasks`, `POST /api/v1/tasks`, `GET/PATCH /api/v1/tasks/{id}` respond per the `tasks` capability spec.

## 3. Backend: status lifecycle, attributes and journal

- [x] 3.1 Implement status transitions (`NEW`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `ARCHIVED`) with a completion timestamp set on `DONE`/`CANCELLED` and cleared on reopen; verify tests for start→finish and reopen.
- [x] 3.2 Implement priority, kind/category, tags (JSON list) and due-date handling incl. the overdue filter; verify tests for the priority default and the overdue query excluding terminal statuses.
- [x] 3.3 Write `TASK` journal entries for create, update, assign, status change, comment, attachment and archive, reusing the event service; verify each mutation in 3.1–3.2 produces the expected journal entry.

## 4. Backend: checklists

- [x] 4.1 Implement checklist item add, rename, reorder, toggle and delete with preserved ordering; verify tests covering add/complete, reorder, and remove-then-order-stable.
- [x] 4.2 Expose checklist progress as completed/total on task read models; verify a test where 2 of 4 items are done reports `2 of 4`.

## 5. Backend: collaboration

- [x] 5.1 Implement task messages with `@mentions` and `is_private` visibility (private hidden from customers), reusing the attachment storage rules; verify tests for a customer-visible message, a private note hidden from a customer, and an oversized attachment rejected (413).
- [x] 5.2 Implement task-level and message-level attachments with delete-by-author-or-admin; verify tests upload a supported file and assert it is listed, downloadable and later removable.
- [x] 5.3 Implement task subscription/unsubscribe; verify a subscriber who is not a participant receives a subsequent task notification, and document the endpoints in the task route module docstring.

## 6. Backend: notifications and reminders

- [x] 6.1 Enqueue assignment, mention and status-change emails through `notification_service`/RQ respecting `mention_email_notifications_enabled`; verify with tests that a status change enqueues a notification for a subscriber, and that mention emails are gated on the user preference.
- [x] 6.2 Add the periodic deadline-reminder job selecting non-terminal tasks inside the reminder window with idempotency key `(task_id, reminder_date)` (run via `python -m app.tasks.task_reminders`); verify a due task produces one reminder, a `DONE` task none, and a second run the same day is a no-op.

## 7. Frontend: task views

- [x] 7.1 Add `frontend/src/api/tasks.ts` mirroring the backend contract; verify the module type-checks and its functions match the OpenAPI paths (mapping covered by `tasks.test.ts`).
- [x] 7.2 Add `TasksPage` with list and Kanban board views, filters (folder, status, assignee, priority, overdue, search) and sorting; verify board columns and list rendering per the `task-board` spec.
- [x] 7.3 Add the task detail view (participants, equipment links, checklists, discussion, attachments) reusing `Modal`; verify the page renders checklist progress and accepts messages/attachments.
- [x] 7.4 Add drag-and-drop between board columns that persists the status change; the drop handler calls `updateTask({status})`.
- [x] 7.5 Add the personal "My tasks" filter (assignee = current user) with overdue highlighting.

## 8. Frontend: integration

- [x] 8.1 Register `/tasks` and `/tasks/:taskId` in `app/router.tsx` and add the navigation entry in `src/lib/nav.ts` (visible to all roles); verify the menu shows "Задачи" after login and the route resolves.
- [x] 8.2 Add a "Tasks" section to `EquipmentDetailsPage` listing tasks linked to the instrument (self-contained `EquipmentTasksSection`).
- [x] 8.3 Add a dashboard "Мои задачи" widget (responsible/assignee, overdue highlight) and a tasks section in `src/content/user-guide.ru.txt` (renumbered following sections).

## 9. Integration and end-to-end checks

- [x] 9.1 Run `npm run check` (backend lint+tests, frontend lint+tests+build) and fix failures.
- [ ] 9.2 Perform the acceptance pass on Stage via `main`: create a task with equipment and one without, assign a responsible and two assignees, run a checklist to completion, post a comment with a mention, move a card across the board, and confirm the journal records every step.
- [ ] 9.3 Verify scoping end-to-end as an MKAIR user and a CUSTOMER: no tasks leak from denied folders, and a customer cannot edit a task but can comment and attach.

## 10. Frontend follow-ups (from Stage review, 2026-10-08)

- [ ] 10.1 Participant editor on the task card (and in the create modal): set/change the responsible and add/remove assignees and observers via the `responsible_user_id` / `assignee_user_ids` / `observer_user_ids` fields; verify a saved change is reflected and the assignee gets the assignment notification.
- [ ] 10.2 Equipment linker in the task card: search equipment (within the task's folder) and attach/detach links via `equipment_ids`; verify the card lists the instruments and the list item's equipment count updates.
- [ ] 10.3 `@` mention autocomplete in the discussion composer using `fetchMentionUsers`, inserting the correct mention key; verify the mention resolves and (when SMTP is configured) an email is enqueued.
- [ ] 10.4 Message attachments: add a download endpoint for message attachments on the backend and show download + inline preview (image/PDF) in the discussion; verify the authenticated download returns the file.
- [ ] 10.5 Task attachments in the card: verify and fix download, and add inline preview (image/PDF) consistent with the equipment attachment preview component.
- [ ] 10.6 Allow choosing assignees, observers and equipment already at creation time in the create-task modal (today only the responsible is selectable).
- [ ] 10.7 Update the documentation (`src/content/user-guide.ru.txt` and `AGENTS.md`) for tasks once the UI follow-ups land: participants, equipment linking, attachments and mentions.
