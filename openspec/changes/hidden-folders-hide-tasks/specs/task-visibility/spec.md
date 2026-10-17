# Spec Delta

## Purpose

The task lists have to show a viewer the work they can act on: this capability decides which tasks
are listed for a viewer, and how a personal folder filter interacts with authorship and
participation.

## ADDED Requirements

### Requirement: Hidden folders keep their tasks out of the lists

A task that lives in a folder the viewer has personally hidden SHALL NOT be listed for that viewer —
neither in the task list and board nor in the «Мои задачи» widget.

#### Scenario: A foreign task in a hidden folder

- **WHEN** the viewer has hidden the folder and is neither the author nor a participant of the task
- **THEN** the task is absent from the task list
- **AND** it is absent from the «Мои задачи» widget

#### Scenario: Another viewer with the folder visible

- **WHEN** a second user has not hidden that folder
- **THEN** the task is still listed for them, since the filter is personal

### Requirement: Your own task stays visible in a hidden folder

A task the viewer authored, or where the viewer is responsible, assignee or observer, SHALL be listed
even when its folder is hidden: an invitation outranks the personal filter.

#### Scenario: Responsible for a task in a hidden folder

- **WHEN** the viewer is responsible for a task in a folder they have hidden
- **THEN** the task is listed for them
- **AND** it appears in the «Мои задачи» widget

#### Scenario: Author of a task in a hidden folder

- **WHEN** the viewer created the task in a folder they have hidden
- **THEN** the task is listed for them

### Requirement: Tasks without a folder stay visible

A task with no folder SHALL NOT be affected by the personal folder filter.

#### Scenario: Folder-less task

- **WHEN** the viewer hides a folder and a task has no folder
- **THEN** the task is still listed for them

### Requirement: Hiding filters lists without taking access away

Hiding a folder SHALL NOT remove access: opening that task by its identifier SHALL still work.

#### Scenario: Direct link to a task in a hidden folder

- **WHEN** the viewer opens a task of a hidden folder by its link (for example from a reminder
  e-mail)
- **THEN** the task is returned instead of an error

### Requirement: The setting says what it hides

The description of the folder settings SHALL state that a personally hidden folder is hidden in the
task lists as well as in the equipment registry.

#### Scenario: Reading the setting

- **WHEN** the viewer opens «Настройки» → «Папки»
- **THEN** the description mentions both equipment and tasks
