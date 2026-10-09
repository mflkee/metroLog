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

### Requirement: Compact application shell

The application shell SHALL stay compact: the top bar SHALL carry one account control (a menu that
contains signing out) instead of a separate sign-out button, the product version and release channel
SHALL read as part of the wordmark rather than as chips of their own, the Arshin status SHALL sit in
the middle of the bar, and the collapsed navigation rail SHALL be narrow while every control stays
legible and reachable.

#### Scenario: The top bar

- **WHEN** an authenticated user looks at the top bar
- **THEN** the wordmark carries the version and the channel on its own line, the Arshin status is
  centred, and the only account control is the account menu, which offers signing out

#### Scenario: The collapsed rail

- **WHEN** the user collapses the navigation
- **THEN** the rail is narrower than before and the icons stay centred and clickable

### Requirement: Choice lists are drawn by the app

A list of choices SHALL be rendered by the application, never by a native `<select>` whose popup is
drawn by the operating system, and the list SHALL be rendered outside the layout so that a modal
cannot clip it.

#### Scenario: Opening a choice list

- **WHEN** the user opens a list of choices, including one inside a modal
- **THEN** the list is drawn by the app in the shared floating menu and can be operated from the
  keyboard

### Requirement: Readable, distinguishable palettes

A colour that carries meaning SHALL stay readable and distinguishable: chart slices SHALL differ in
hue and in lightness, and a status colour used as text SHALL meet WCAG AA on the surface it is drawn
on.

#### Scenario: Two chart slices side by side

- **WHEN** two chart slices are shown next to each other on a dark theme
- **THEN** they differ in hue and in lightness, so they do not read as one colour

#### Scenario: A status colour used as text

- **WHEN** a status colour is used for text (a priority label, «просрочено»)
- **THEN** it has a contrast ratio of at least 4.5 against the surface behind it

#### Scenario: Surfaces on the light theme

- **WHEN** a card or a field is shown on the light theme
- **THEN** it is lighter than the page behind it and reads as a surface of its own, rather than the
  page, the cards and the fields all being shades of the same grey
