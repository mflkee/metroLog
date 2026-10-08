# Spec Delta

## ADDED Requirements

### Requirement: Dragged element moves itself
A drag interaction SHALL move the element being dragged rather than a browser-drawn placeholder,
and the element SHALL settle into the drop target with an animation.

#### Scenario: Dragging a task card
- **WHEN** the user drags a task card over another board column
- **THEN** the card itself follows the pointer and, on drop, animates to its place in that column

#### Scenario: Dragging without a pointer
- **WHEN** the user operates the board with the keyboard
- **THEN** a card can still be moved to another column

### Requirement: Per-user ordering
A user MAY reorder a list for themselves without changing what other users see, and the default
order SHALL be deterministic (alphabetical) until the user changes it.

#### Scenario: Reordering folders
- **WHEN** a user moves a folder in the Equipment list
- **THEN** the new order is kept for that user after a reload and another user still sees the
  default alphabetical order

#### Scenario: A stale entry
- **WHEN** a stored order refers to a folder that no longer exists
- **THEN** the list renders normally, ignoring the missing entry

### Requirement: Boolean controls use a switch
A control that toggles a boolean value SHALL be a switch. A control that selects among many items
SHALL remain a checkbox or a selection list, never a switch.

#### Scenario: Toggling a setting
- **WHEN** the user toggles a boolean setting
- **THEN** a switch reflects and persists the new value and can be operated from the keyboard

#### Scenario: Selecting rows
- **WHEN** the user selects several rows in a table
- **THEN** the selection is made with checkboxes, not switches
