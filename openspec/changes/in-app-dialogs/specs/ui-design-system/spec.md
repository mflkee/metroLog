# Spec Delta

## ADDED Requirements

### Requirement: Confirmation is drawn by the app

A destructive or otherwise consequential action SHALL ask for confirmation in a dialog the app
draws itself, with the app's wording and its own pending state. The app SHALL NOT use the
browser's `confirm`, `alert` or `prompt` dialogs.

#### Scenario: Deleting a task

- **WHEN** the user presses Delete on a task
- **THEN** the app's confirmation dialog appears and the task is deleted only after the user
  confirms

#### Scenario: Deleting a deadline preset

- **WHEN** the user presses Delete on a deadline preset
- **THEN** the app's confirmation dialog appears and the preset is deleted only after the user
  confirms

#### Scenario: Deleting a discussion message

- **WHEN** the user presses Delete on a message in a repair, a verification or a task
- **THEN** the app's confirmation dialog appears and the message is deleted only after the user
  confirms

#### Scenario: Deleting an attachment

- **WHEN** the user presses Delete on a task attachment
- **THEN** the app's confirmation dialog names the file and deletes it only after the user confirms

#### Scenario: Deleting a draft

- **WHEN** the user removes a checklist item, a process stage row, a not-yet-uploaded file or a
  preset variant
- **THEN** it disappears without a dialog, because a form draft is not a deletion

#### Scenario: The API refuses a deletion

- **WHEN** the user confirms a deletion the API refuses, such as a preset a folder still selects
- **THEN** the dialog stays open and shows the reason, and the item remains in the list

#### Scenario: Cancelling

- **WHEN** the user dismisses a confirmation dialog without confirming
- **THEN** nothing is deleted

### Requirement: The browser's own dialogs stay out

The app SHALL NOT call `window.confirm`, `window.alert` or `window.prompt`. Warning about an
unsaved edit on reload or tab close MAY use the browser's `beforeunload` event, which is the only
mechanism available for it.

#### Scenario: A regression is caught

- **WHEN** a source file starts calling one of those three dialog functions
- **THEN** the source guard test fails

#### Scenario: Leaving with an unsaved edit

- **WHEN** the user reloads or closes the tab while an edit has not reached the server
- **THEN** the browser's leave-site warning is offered
