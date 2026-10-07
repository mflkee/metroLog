# Spec Delta

## Purpose

Adds ordered checklist items to a task so a task can be broken into small,
trackable steps without creating separate tasks.

## ADDED Requirements

### Requirement: Checklist items

A task SHALL support an ordered list of checklist items. Each item SHALL have a
label, a completion flag and an order within the task. Items SHALL be addable,
renamable, reorderable and removable while the task is not terminal.

#### Scenario: Add and complete an item
- **WHEN** a participant adds a checklist item and then marks it complete
- **THEN** the item shows as completed and the task exposes updated progress

#### Scenario: Reorder items
- **WHEN** a participant moves an item up or down
- **THEN** the persisted order matches the new arrangement

#### Scenario: Remove an item
- **WHEN** a participant removes a checklist item
- **THEN** the item is deleted and the remaining order is preserved

### Requirement: Checklist progress

The system SHALL expose checklist progress as completed-count over total-count.

#### Scenario: Progress reflects completion
- **WHEN** a task has four items and two are completed
- **THEN** the task reports checklist progress of 2 of 4
