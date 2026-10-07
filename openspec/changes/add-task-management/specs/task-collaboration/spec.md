# Spec Delta

## Purpose

Lets task participants and watchers discuss a task, share files, subscribe to its
changes and receive email notifications, so task work stays auditable in one
place next to the equipment it concerns.

## ADDED Requirements

### Requirement: Task discussion

A task SHALL support an ordered discussion of messages authored by users who can
access the task's folder. A message SHALL have an author, text and timestamp and
SHALL be editable and deletable by its author or an administrator.

#### Scenario: Post a message
- **WHEN** a participant posts a message on a task
- **THEN** the message appears in the task discussion with the author and timestamp

#### Scenario: Customer may comment
- **WHEN** a CUSTOMER with folder access posts a message on a task
- **THEN** the message is stored and visible to other participants

### Requirement: Private notes

A message SHALL be markable as private. A private message SHALL be visible only
to operators, administrators and the message author.

#### Scenario: Private note hidden from customer
- **WHEN** an MKAIR user posts a private note on a task
- **THEN** a CUSTOMER viewing the same task does not receive that note

### Requirement: Mentions and notifications

A message SHALL support `@mentions`. When a user is mentioned, when a task is
assigned, and when a task status changes, the system SHALL enqueue an email
notification to the affected users who have notifications enabled.

#### Scenario: Mention enqueues email
- **WHEN** a participant mentions a user in a task message and that user has mention notifications enabled
- **THEN** an email notification job is enqueued for that user

#### Scenario: Assignment enqueues email
- **WHEN** a user becomes the responsible participant or an assignee of a task
- **THEN** an email notification job is enqueued for that user

### Requirement: Task attachments

A task SHALL accept file attachments at task level and on discussion messages.
Attachment handling SHALL reuse the existing upload size, type and storage rules.

#### Scenario: Attach a file to a task
- **WHEN** a participant uploads a supported file to a task
- **THEN** the file is stored and listed among the task attachments

#### Scenario: Reject an oversized file
- **WHEN** a participant uploads a file larger than the configured limit
- **THEN** the upload is rejected with 422 and no attachment is stored

### Requirement: Task subscriptions

A user SHALL be able to subscribe to and unsubscribe from a task. Subscribers
SHALL receive task notifications even when they are not participants.

#### Scenario: Subscribe to a task
- **WHEN** a user subscribes to a task
- **THEN** the user is notified about subsequent task changes

### Requirement: Deadline reminders

The system SHALL enqueue email reminders for tasks that approach or pass their
due date. Reminders SHALL NOT be sent for tasks in a terminal status.

#### Scenario: Reminder before due date
- **WHEN** a task with a due date reaches the reminder lead time
- **THEN** an email reminder is enqueued for its responsible participant and assignees

#### Scenario: No reminder for a closed task
- **WHEN** a task is `DONE`, `CANCELLED` or `ARCHIVED`
- **THEN** no deadline reminder is enqueued for it
