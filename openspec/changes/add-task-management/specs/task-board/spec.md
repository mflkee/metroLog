# Spec Delta

## Purpose

Provides task views for planning and monitoring: a Kanban board grouped by
status and a filterable list, so users can see what is due, who owns it and
where every task stands.

## ADDED Requirements

### Requirement: Kanban board

The system SHALL provide a board view that groups tasks into columns by status
(`NEW`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`). Archiving SHALL NOT
create a board column.

#### Scenario: Board reflects status
- **WHEN** a user opens the task board
- **THEN** each non-archived task appears in the column matching its status

#### Scenario: Move a card changes status
- **WHEN** a participant drags a task card from `NEW` to `IN_PROGRESS`
- **THEN** the task status becomes `IN_PROGRESS` and the change is journaled

### Requirement: Task list view

The system SHALL provide a list view of tasks that can be filtered by folder,
status, responsible participant, assignee, priority, due date and linked
equipment, and sorted by due date, priority or last update.

#### Scenario: Filter by assignee
- **WHEN** a user filters the list by a specific assignee
- **THEN** only tasks where that user is an assignee are returned

#### Scenario: Sort by due date
- **WHEN** a user sorts the list by due date ascending
- **THEN** tasks with the earliest due dates appear first and tasks without a due date appear last

#### Scenario: Scoped results
- **WHEN** a folder-scoped user applies any filter
- **THEN** results never include tasks from folders outside their allowed set

### Requirement: Personal task overview

The system SHALL provide a view of the tasks where the current user is the
responsible participant or an assignee, including overdue tasks.

#### Scenario: My tasks
- **WHEN** a user opens the personal task overview
- **THEN** tasks where they are responsible or an assignee are listed, with overdue tasks highlighted
