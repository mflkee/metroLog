# Spec Delta

## Purpose

Lets each user arrange the dashboard widgets to their own needs — order, width and collapsed
state — without affecting anybody else, while the default arrangement stays exactly as it was.

## ADDED Requirements

### Requirement: Personal arrangement

Each user's dashboard arrangement SHALL be stored for that user alone and SHALL be restored on
every later visit and on another device.

#### Scenario: The arrangement survives a reload

- **WHEN** a user rearranges widgets and reloads the page
- **THEN** the dashboard shows the same order, widths and collapsed states

#### Scenario: The arrangement is personal

- **WHEN** one user rearranges widgets
- **THEN** another user's dashboard is unchanged

#### Scenario: First visit

- **WHEN** a user has never arranged the dashboard
- **THEN** the dashboard shows the default arrangement

#### Scenario: A failed save

- **WHEN** saving the arrangement fails
- **THEN** the user is told about the failure and the previous arrangement is shown again

### Requirement: Default arrangement

The default arrangement SHALL match the layout that existed before this change: the same widget
order and the same widths.

#### Scenario: Nothing moves on release

- **WHEN** an existing user who never arranged the dashboard opens it after this change
- **THEN** every widget keeps the position and the width it had before

### Requirement: Reordering widgets

In the dashboard edit mode a user SHALL be able to move a widget to another position, and the new
position SHALL be stored.

#### Scenario: Dragging a widget

- **WHEN** the user drags a widget onto another widget's place in edit mode
- **THEN** the widgets take each other's positions and the order is kept after a reload

#### Scenario: Moving a widget without a pointer

- **WHEN** the user operates the dashboard edit mode from the keyboard
- **THEN** a widget can still be moved to another position

### Requirement: Width presets

Every widget SHALL have exactly one of three width presets — a third of the row, a half of the
row, or the full row — chosen in edit mode, and the widget SHALL occupy that share of the row on
wide screens.

#### Scenario: Changing a width

- **WHEN** the user picks a different width preset for a widget in edit mode
- **THEN** the widget takes that share of the row and the choice is kept after a reload

#### Scenario: Default widths

- **WHEN** a user has never changed widths
- **THEN** each widget uses the width it had before this change

### Requirement: Collapsing widgets

A user SHALL be able to collapse a widget to its title and expand it again, and the state SHALL be
stored.

#### Scenario: Collapsing and expanding

- **WHEN** the user collapses a widget and later expands it
- **THEN** only its title remains while collapsed and its content returns on expand

#### Scenario: The collapsed state survives a reload

- **WHEN** a user collapses a widget and reloads the page
- **THEN** the widget is still collapsed

### Requirement: Edit mode

Arrangement controls SHALL appear only in an explicit dashboard edit mode. Outside it the widgets
SHALL look and behave as before, with their content interactive and no drag behaviour.

#### Scenario: Entering and leaving edit mode

- **WHEN** the user turns the dashboard edit mode on and then off
- **THEN** the arrangement controls appear and then disappear, and the widget content is
  interactive again

#### Scenario: Resetting the arrangement

- **WHEN** the user resets the arrangement in edit mode
- **THEN** the order, the widths and the collapsed states return to the default arrangement

### Requirement: Visibility stays in Settings

Which widgets appear SHALL be chosen in Settings. A widget that is switched off SHALL keep its
saved position, width and collapsed state, and SHALL return with them when switched on again.

#### Scenario: Hiding and showing a widget

- **WHEN** a user switches a widget off in Settings and later switches it back on
- **THEN** the widget reappears with its saved position, width and collapsed state

### Requirement: Narrow screens

Below the wide breakpoint the widgets SHALL stack full width in the user's chosen order, and drag
rearrangement SHALL not be offered there.

#### Scenario: A narrow viewport

- **WHEN** the dashboard is opened on a narrow viewport
- **THEN** the widgets are stacked in the chosen order, each full width, and edit mode offers no
  dragging

### Requirement: Normalizing a stored arrangement

A stored arrangement SHALL never break the page: entries naming unknown widgets SHALL be ignored,
widgets missing from it SHALL be appended in the default order, and an unreadable arrangement
SHALL fall back to the default arrangement.

#### Scenario: A widget removed by a later release

- **WHEN** a stored arrangement names a widget that no longer exists
- **THEN** the dashboard renders normally and ignores that entry

#### Scenario: A widget added by a later release

- **WHEN** a new widget ships while a user already has a stored arrangement
- **THEN** the new widget appears at the end of the arrangement with its default width

#### Scenario: A widget the user may not see

- **WHEN** a stored arrangement holds a widget the user is not allowed to see
- **THEN** the widget is not rendered and its entry is kept for when the user is allowed to see it
