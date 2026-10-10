# Spec Delta

## ADDED Requirements

### Requirement: A date field carries no separate shortcut

A date field SHALL be the field itself with its calendar toggle inside it. A separate button beside
the field SHALL NOT be added, so that the control reads as one thing and the calendar stays the one
place a date is picked.

#### Scenario: Looking at a date field

- **WHEN** the user looks at any date field in the app
- **THEN** it shows the field and its calendar toggle, and no button beside it

#### Scenario: Picking today

- **WHEN** the user opens the calendar
- **THEN** today is highlighted and one click selects it

#### Scenario: A regression is caught

- **WHEN** the shortcut is added back to the sources or to the stylesheet
- **THEN** the conventions guard test fails
