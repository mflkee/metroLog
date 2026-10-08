# Spec Delta

## Purpose

Defines the behavior the metroLog interface SHALL preserve as it adopts shared UI
primitives, so that theming, dialog dismissal and control behavior stay consistent for
users across the application.

## ADDED Requirements

### Requirement: Token-driven theming
All UI components SHALL take their colors, radii and spacing from the shared design tokens,
and every selectable theme SHALL apply to them.

#### Scenario: Switching theme restyles adopted components
- **WHEN** the user selects a different theme
- **THEN** every adopted component reflects the selected theme without a page reload

#### Scenario: No hardcoded palette
- **WHEN** an adopted component is rendered
- **THEN** its colors come from design tokens rather than fixed color values

### Requirement: Dialog dismissal contract
Dialogs SHALL NOT close when the user clicks outside them, so that entered content is never
lost. A dialog SHALL close only through an explicit close control or the Escape key.

#### Scenario: Backdrop click keeps the dialog open
- **WHEN** the user clicks the area outside an open dialog
- **THEN** the dialog stays open and the entered content is preserved

#### Scenario: Explicit controls close the dialog
- **WHEN** the user activates the close control or presses the Escape key
- **THEN** the dialog closes

#### Scenario: Every dialog has a close control
- **WHEN** any dialog is open
- **THEN** an explicit close control is visible

### Requirement: Consistent control behavior
Adopted controls SHALL keep keyboard navigation and focus behavior equivalent to or better
than the controls they replace.

#### Scenario: Keyboard operable
- **WHEN** the user navigates a dialog, dropdown, select or tab list with the keyboard
- **THEN** focus moves predictably and options are selectable without a mouse
