# Spec Delta

## Purpose

Provides first-class work items ("tasks") in metroLog that can be planned,
assigned and tracked independently of repairs and verifications, with optional
links to equipment and per-folder access control.

## ADDED Requirements

### Requirement: Task creation

The system SHALL allow every authenticated user to create a task in any folder
they can access. A task SHALL have a title, an author, a folder, a status and a
creation timestamp. Description, kind/category, priority and due date SHALL be
optional.

#### Scenario: Operator creates a task in an allowed folder
- **WHEN** an MKAIR user submits a new task with a title in a folder from their allowed set
- **THEN** the task is created with status `NEW`, the author is recorded, and a `task_created` entry is written to the event journal

#### Scenario: Customer creates a task in an allowed folder
- **WHEN** a CUSTOMER user submits a new task in an allowed folder
- **THEN** the task is created and they are recorded as its author

#### Scenario: Task creation targets a denied folder
- **WHEN** a folder-scoped user submits a task for a folder outside their allowed set
- **THEN** the system responds with 404 and creates no task

#### Scenario: Empty title is rejected
- **WHEN** a user submits a task without a title
- **THEN** the system rejects the request with 422 and creates no task

### Requirement: Task list and detail access

The system SHALL return only tasks whose folder is within the requesting user's
allowed folders. Users with unrestricted folder access SHALL see all tasks.

#### Scenario: Scoped user lists tasks
- **WHEN** an MKAIR user opens the task list
- **THEN** only tasks in their allowed folders are returned

#### Scenario: Unrestricted user lists tasks
- **WHEN** an ADMINISTRATOR opens the task list
- **THEN** tasks from every folder are returned

### Requirement: Equipment links on a task

A task SHALL link zero or more equipment items. Adding or removing equipment
links SHALL NOT be required for a task to exist or to be completed. Each link
SHALL retain association with the live equipment record.

#### Scenario: Task without equipment
- **WHEN** a user creates and completes a task with no equipment linked
- **THEN** the task is valid and displays no equipment

#### Scenario: Task with several equipment items
- **WHEN** a user links three instruments to a task
- **THEN** the task detail lists all three, and each instrument's card lists the task

#### Scenario: Linked equipment is deleted
- **WHEN** a task is linked to equipment and that equipment is later deleted
- **THEN** the equipment link is removed and the task remains

### Requirement: Task participants and roles

A task SHALL have exactly one responsible participant, any number of assignees,
and any number of observers. Participants SHALL be existing active users. The
responsible participant and assignees SHALL be able to change the task; the
author and administrators SHALL be able to change participants.

#### Scenario: Assign a responsible and assignees
- **WHEN** a user sets one responsible participant and two assignees on a task
- **THEN** the task exposes one responsible and two assignees, and both roles are notified

#### Scenario: Replacing the responsible participant
- **WHEN** the responsible participant is changed to another user
- **THEN** the task has exactly one responsible participant and a `task_assignee_changed` entry is written to the journal

#### Scenario: Observer cannot mutate the task
- **WHEN** an observer who is neither the author, an operator, nor an administrator attempts to change the task status
- **THEN** the system responds with 403 and the status is unchanged

### Requirement: Task status lifecycle

A task SHALL have a status of `NEW`, `IN_PROGRESS`, `ON_HOLD`, `DONE`,
`CANCELLED` or `ARCHIVED`. Moving to `DONE` or `CANCELLED` SHALL require the
task to be otherwise valid and SHALL record a completion timestamp. Any
participant or operator SHALL be able to change the status.

#### Scenario: Start and finish a task
- **WHEN** an assignee moves a task from `NEW` to `IN_PROGRESS` and later to `DONE`
- **THEN** the task shows `DONE` with a completion timestamp and journal entries for both transitions

#### Scenario: Reopen a finished task
- **WHEN** a participant moves a `DONE` task back to `IN_PROGRESS`
- **THEN** the task shows `IN_PROGRESS` and the completion timestamp is cleared

### Requirement: Task attributes

A task SHALL support a priority of `LOW`, `NORMAL`, `HIGH` or `CRITICAL`
(default `NORMAL`), an optional kind/category and optional free-form tags, and
an optional due date.

#### Scenario: Priority defaults
- **WHEN** a user creates a task without specifying priority
- **THEN** the task priority is `NORMAL`

#### Scenario: Filtering by due date
- **WHEN** a user filters tasks by an overdue due date
- **THEN** only tasks whose due date is before today and whose status is not `DONE`, `CANCELLED` or `ARCHIVED` are returned

### Requirement: Task journaling

Every task mutation SHALL write an entry to the event journal under the `TASK`
category, including the acting user, the task, the folder and, when present, the
linked equipment.

#### Scenario: Journal records status change
- **WHEN** a participant changes a task status
- **THEN** a `TASK` journal entry with the previous and new status is recorded
