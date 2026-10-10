# Spec Delta

## ADDED Requirements

### Requirement: Numeric input is drawn by the app

A field that holds a number SHALL be a control the app draws itself. The app SHALL NOT use the
browser's number input, so that the browser never changes the value on a wheel scroll, never raises
its own validation message and never accepts a character the field's contract excludes.

#### Scenario: Typing into a numeric field

- **WHEN** the user types or pastes a character that is not a digit
- **THEN** the field keeps only the digits of what was entered

#### Scenario: Scrolling over a focused field

- **WHEN** the pointer wheel scrolls the page while a numeric field has focus
- **THEN** the value does not change

#### Scenario: An empty numeric field

- **WHEN** the user clears a numeric field that may be empty
- **THEN** the field is empty and the stored value is cleared

#### Scenario: A regression is caught

- **WHEN** a source file asks the browser for a number field
- **THEN** the conventions guard test fails
