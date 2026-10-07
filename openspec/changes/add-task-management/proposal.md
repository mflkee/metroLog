# Proposal

## Why

metroLog tracks equipment, repairs and verifications, but it has no way to plan
and track arbitrary work: who is responsible, who executes it, by when, and
which instruments it concerns. Teams keep that in side spreadsheets and chat, so
work is lost and is not auditable next to the equipment it touches. A task
module closes that gap and reuses the existing folder, journal, notification and
discussion machinery.

## What Changes

- Add a first-class **Task** entity, scoped to an equipment folder, with title,
  description, status, priority, kind/category, due date, author and archive.
- Let a task link **zero or more** equipment items: a task may target concrete
  instruments or be pure paperwork with no equipment attached.
- Add **participants** with roles: exactly one responsible user, one or more
  assignees, and any number of observers.
- Allow **all authenticated roles** to create tasks. Resource access stays
  folder-scoped (MKAIR/CUSTOMER are limited to their allowed folders); mutating
  or reassigning a task stays restricted to its participants plus
  operators/administrators.
- Add **checklists** (ordered checklist items) inside a task.
- Add a **Kanban board** and a filterable, sortable **list view** over tasks.
- Add **discussion** (comments with `@mentions` and private notes),
  **attachments**, **subscriptions** and **email notifications**, including
  deadline reminders.
- Record task activity in the unified **event journal** under a new `TASK`
  category, and surface tasks on the equipment card and the dashboard.

## Capabilities

### New Capabilities
- `tasks`: core task lifecycle (create, edit, archive, close), folder scoping,
  status, priority, kind/category, due date, equipment links and participants.
- `task-collaboration`: task discussion, `@mentions`, private notes,
  attachments, subscriptions and email notifications including deadline
  reminders.
- `task-checklists`: ordered checklist items inside a task.
- `task-board`: Kanban board and list views with filtering and sorting.

### Modified Capabilities
<!-- None: no existing capability requirements change. `add-task-management` is
     the first OpenSpec change in this repository. -->

## Impact

- **Backend**: new tables (`tasks`, `task_participants`, `task_equipment`,
  `task_messages`, `task_message_attachments`, `task_attachments`,
  `task_checklist_items`, `task_subscriptions`), a new Alembic revision, a new
  `TaskService`, `TaskRepository`, `schemas/task.py`, `routes/tasks.py`, router
  registration, `EventCategory.TASK`, and an RQ reminder job.
- **Frontend**: new `/tasks` routes and pages, navigation entry
  (`src/lib/nav.ts`), dashboard widgets, a "Tasks" section on
  `EquipmentDetailsPage`, and `src/api/tasks.ts`.
- **Notifications**: new RQ job and email templates; reuses `notification_service`.
