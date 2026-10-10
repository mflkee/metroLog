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
  with a background that is a square around the icon — the row there *is* the icon, so a pill taller
  than it is wide is wrong

### Requirement: The theme catalogue is curated and dark-only

The application SHALL ship dark themes only, and the catalogue SHALL stay curated: a theme that does
not fit the product or that reads as a near-duplicate of another SHALL be removed. The theme picker
SHALL show the name of a theme and nothing else. A stored preference for a theme that no longer
exists SHALL fall back to the neutral dark theme rather than leaving the user without one.

#### Scenario: Choosing a theme

- **WHEN** the user opens the theme picker
- **THEN** every entry is a theme name alone, and every theme offered is dark

#### Scenario: A retired preference

- **WHEN** a stored preference names a theme this build no longer ships
- **THEN** the neutral dark theme is applied, and no error is shown

#### Scenario: A client with a cached bundle

- **WHEN** a client holding an older bundle asks for a retired theme
- **THEN** the request is accepted and the applied theme is the neutral dark one

### Requirement: The default dashboard arrangement tiles the grid

The arrangement a user gets before arranging anything SHALL fill the twelve-column grid exactly, with
no hole left in a row, and SHALL be the owner's arrangement.

#### Scenario: A fresh account

- **WHEN** a user who has never arranged the dashboard opens it
- **THEN** the modules are laid out as `full`, three `third`s, two rows of two `half`s and a final
  `full`, leaving no gap

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

#### Scenario: The tasks module is a reminder, not a list

- **WHEN** the tasks module has more than three open tasks, at any width
- **THEN** it shows the three most important ones, and among equally important ones those with the
  nearest deadline, with a task that has no deadline after every dated one of the same importance

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
