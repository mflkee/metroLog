# Spec Delta

## ADDED Requirements

### Requirement: A colour that carries text holds AA

A theme token used as the colour of text SHALL reach a contrast ratio of at least 4.5 against its
theme's panel. A token that paints a surface SHALL NOT be reused as text where it falls short:
where one colour is wanted for both, the text side gets its own token.

#### Scenario: An error line in every theme

- **WHEN** an error line is shown in any of the seven themes
- **THEN** its red reaches AA on that theme's panel

#### Scenario: A danger surface

- **WHEN** a danger tint or a danger border is drawn
- **THEN** it uses the surface token, and the text token does not alter it

#### Scenario: Reading a danger button

- **WHEN** the user reads the label of a danger button
- **THEN** it uses the text token and is readable in every theme
