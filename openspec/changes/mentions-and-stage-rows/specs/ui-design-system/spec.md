# Spec Delta

## ADDED Requirements

### Requirement: A mention is picked out

A mention (an `@` followed by a person's key) in a comment or a message SHALL be distinguishable
from the words around it, in the theme's blue, and SHALL NOT rely on colour alone. A mention SHALL
be the only thing picked out: an email address in the text SHALL stay plain.

#### Scenario: Writing a mention

- **WHEN** a comment or a message contains `@БулашевАН`
- **THEN** the name is shown in the theme's blue and the rest of the text is unchanged

#### Scenario: An email address in the text

- **WHEN** a comment contains `user@mkair.ru`
- **THEN** nothing in it is picked out

#### Scenario: Reading a mention in any theme

- **WHEN** the user switches the theme
- **THEN** the mention keeps the theme's blue and stays readable on the message card

### Requirement: A stage row carries no redundant captions

A stage row of an expanded repair or verification card SHALL show the stage, its date control, its
deadline and its status without the «Дата» and «Статус» captions, because the date control's own
placeholder and the status text carry the meaning. The cells of the row SHALL align at the top.

#### Scenario: Expanding a card

- **WHEN** the user expands a repair or a verification card
- **THEN** each stage row shows no «Дата» or «Статус» caption and the row is shorter than before

#### Scenario: A stage without a deadline

- **WHEN** a stage has no deadline
- **THEN** the row keeps its shape and the other cells stay aligned
