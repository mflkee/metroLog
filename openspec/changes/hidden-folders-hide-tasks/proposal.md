# Proposal

## Why

A user's **personally hidden folders** (`hidden_equipment_folder_ids`) currently hide the folder only
in the equipment registry tree. Tasks of that folder keep appearing in the task list, on the board
and in the «Мои задачи» widget, so a person who deliberately removed a folder from their view still
sees its work — and the setting promises less than it does. Reported by the owner after checking who
sees a task in a hidden folder.

## What Changes

- Hidden folders ALSO filter the task lists: a task that lives in a personally hidden folder is not
  shown to that user in «Задачи» (list and board) and in the «Мои задачи» widget.
- The filter **never hides your own task**: one you authored, or where you are responsible, assignee
  or observer, stays visible whatever folder it is in.
- Tasks without a folder stay visible (there is no folder to hide).
- Hiding is a **view filter, not an access rule**: a link to the task still opens it, so reminder
  e-mails keep working.
- The setting's description says that it hides the folder in tasks as well as in equipment.

## Capabilities

### New Capabilities
- `task-visibility`: how the task lists decide which tasks a viewer is shown, and how a personal
  folder filter interacts with authorship and participation.

### Modified Capabilities
<!-- None. -->

## Impact

- **Backend**: `app/repositories/task_repository.py` (one more filter in the list query),
  `app/services/task_service.py` (pass the viewer's hidden folders), tests.
- **Frontend**: the description of the «Папки» section in `SettingsPage.tsx` — no behaviour there,
  the list already comes filtered from the server.
- **Database**: no migration; the per-user list already exists on `users`.
- **Ops**: verify on Stage that a hidden folder hides a foreign task but not your own.
