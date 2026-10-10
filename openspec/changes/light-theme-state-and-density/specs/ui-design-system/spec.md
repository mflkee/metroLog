# Spec Delta

## ADDED Requirements

### Requirement: State is carried by the surface

Interactive state (hover, active, selected) SHALL be conveyed by a change of the surface, not by a
change of a border's colour. A resting control, card or badge MAY keep its own border, but a hover,
a selection or an active tab SHALL NOT recolour a border. Keyboard focus SHALL remain visible
through an outline, which is the one ring the app adds.

#### Scenario: Hovering a control

- **WHEN** the pointer enters a button, a tab, a chip or a list row
- **THEN** its background changes to a lighter or darker surface of the current theme and no border
  colour changes

#### Scenario: Selecting a chip or a navigation row

- **WHEN** a chip, a tab or a navigation row becomes selected or active
- **THEN** it is marked by an accent-tinted background and its border stays the resting border

#### Scenario: Keyboard focus

- **WHEN** the user reaches a control with the keyboard
- **THEN** a visible outline is drawn around it

#### Scenario: The collapsed navigation rail

- **WHEN** the navigation is collapsed
- **THEN** each icon is drawn without a border of its own, and the row answers hover and selection
  with a background

### Requirement: Light theme contrast floor

The light theme SHALL keep its borders and its muted text above the contrast floor that survives a
hairline on a white surface: a card or separator border SHALL contrast at least 2.0 against the
panel, the border of an interactive control at least 2.8, and the muted text at least 7.0.

#### Scenario: A card on the light theme

- **WHEN** a card is drawn on the light theme
- **THEN** its border contrasts at least 2.0 against the panel and reads as a line rather than as a
  ripple at a zoomed-out viewport

#### Scenario: Secondary text on the light theme

- **WHEN** secondary text is drawn on a white panel
- **THEN** it contrasts at least 7.0 and is comfortably readable

### Requirement: Widget content follows its width

A dashboard module SHALL render more of its content the wider its width preset is. A `third` module
SHALL show the identity of each item and one supporting fact, a `half` module SHALL add the next
most useful field, and a `full` module SHALL show the content the module has. The decision SHALL be
made from the module's width preset, not from a viewport breakpoint.

#### Scenario: The tasks module at three widths

- **WHEN** the tasks module is a third wide
- **THEN** each task shows its title, status and due date

- **WHEN** the same module is a half wide
- **THEN** each task also shows its priority and folder

- **WHEN** the same module is full width
- **THEN** each task also shows its responsible, participant count, checklist progress and equipment
  count

#### Scenario: A module that lists rows

- **WHEN** a module listing rows (locations, upcoming checks, recent events) is narrowed
- **THEN** it drops its least important fields and shows fewer rows, instead of squeezing the full
  content into the narrow preset

### Requirement: Everything is on by default

A user who has not chosen SHALL get every dashboard widget and every theme. A stored `null` SHALL
mean "the default", and a user who has never trimmed a list SHALL see newly added widgets and themes
without any further action.

#### Scenario: A fresh account

- **WHEN** a user opens the app for the first time
- **THEN** every dashboard widget is on and every theme is offered in the theme switcher

#### Scenario: An account with a trimmed list

- **WHEN** an account holds a trimmed list of widgets or themes
- **THEN** it is reset to the default once, so it too gets every widget and every theme
