# Design

## Context

See `proposal.md` — Why.

Task visibility today is built in one place, `task_repository._build_task_list`:

- a user with a restricted folder scope (`allowed_folder_ids`) sees the tasks of those folders plus
  everything they authored or take part in;
- `DEVELOPER`/`ADMINISTRATOR` have no scope at all (`allowed_folder_ids is None`), so for them the
  query is unfiltered;
- opening a task by id is a separate check (`task_service._assert_task_visible`) and answers 404 for
  a foreign folder, so existence is not leaked.

The hidden folders (`users.hidden_equipment_folder_ids`) are read today only by the equipment
registry page on the client (`EquipmentPage.tsx`) — the server never looks at them, which is why they
have no effect on tasks.

## Goals / Non-Goals

**Goals:**

- A personally hidden folder also keeps its foreign tasks out of the task lists, uniformly in the
  list, the board and the «Мои задачи» widget.
- Never hide a task the viewer can be expected to act on: their own (author) or one they take part in.
- Keep it a view filter: access and direct links are unchanged.

**Non-Goals:**

- Taking access away — that is what «Доступ к папкам» (`allowed_folder_ids`) is for, and the
  registry already treats hiding as display-only.
- Hiding anything from `ADMINISTRATOR`/`DEVELOPER` by definition (they may hide a folder for
  themselves, but nothing is hidden *from* their role).
- Server-side tasks (reminders) — the reminder job has no viewer and keeps working from the full set,
  which is what should happen: hiding a folder must not silence a deadline.

## Decisions

### The filter lives in the task list query, not on the client

One `GET /tasks` endpoint feeds the list, the board and the «Мои задачи» widget, so a single
server-side condition covers all three; the client keeps receiving a list it does not need to
post-filter (which also keeps counters and pagination honest). *Alternative considered:* filtering in
the frontend — rejected, because pagination and totals would then describe a different set than the
page shows.

### Everything the viewer is part of outranks the filter

The condition is «the task's folder is not hidden, OR the task has no folder, OR the viewer is the
author, OR the viewer is a participant». Participation is the same escape hatch the folder scope
already uses, so the two filters read the same way and an invitation can never be silently lost.

### Hiding does not touch the open-by-id check

`_assert_task_visible` stays as it is, so a reminder e-mail link opens the task even when the folder
is hidden. Hiding is about lists; hiding a *working* task from the person responsible for it would be
a bug, not a feature.

### No migration, one copied line of UI text

The per-user list already exists on `users`; only the description of the «Папки» settings section
changes, so nothing in the database or the API shape moves.

## Risks / Trade-offs

- [A person hides a folder and then wonders where those tasks went] → the tasks they take part in stay
  visible, and the setting now says it hides tasks too; unhiding restores everything.
- [An operator hides a folder to tidy the registry and unexpectedly loses tasks] → the same
  mitigation: the UI text names both lists.
- [Two filters (scope and hidden) could drift] → both are applied in the same query and use the same
  participant escape hatch; a test covers each branch.
