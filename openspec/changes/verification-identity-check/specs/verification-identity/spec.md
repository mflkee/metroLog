# Spec Delta

## Purpose

A verification in metroLog has to be the verification of the instrument the card describes; this
capability decides when that can be asserted automatically, when a human has to confirm it, and how
a mismatch is made visible.

## ADDED Requirements

### Requirement: A serial carried by several instruments is never auto-applied

When the serial of a matched verification is also carried by Arshin instruments belonging to another
type or modification, the refresh SHALL NOT treat the match as resolved: the row SHALL be marked as
requiring review and SHALL name the conflicting instruments. When the refresh also found an update,
that update SHALL require review instead of being offered as a regular one.

#### Scenario: Short serial shared across types

- **WHEN** the card's serial is `45549`, which Arshin carries for both «Измерители влажности» and
  «Манометры, вакуумметры»
- **THEN** the row requires review
- **AND** the note names the types found for that serial

#### Scenario: Serial unique to one instrument

- **WHEN** the only Arshin record with that serial is of the same type and modification as the match
- **THEN** the row is offered as a regular update

#### Scenario: Nothing newer, but the serial is shared

- **WHEN** the serial is carried by several instruments and no newer verification exists
- **THEN** the row is marked as requiring review
- **AND** the note says that the serial belongs to several instruments

### Requirement: The certificate's instrument is shown on the card

The SI block of the equipment card SHALL show the instrument type (registry number and title) and
the modification recorded in the verification, so that a look at the card reveals which instrument
the certificate belongs to.

#### Scenario: Card with a certificate

- **WHEN** an instrument carries a verification whose type is «58669-14 Весы неавтоматического
  действия» and modification `GH-252`
- **THEN** the card shows that type and modification next to its own data

### Requirement: A contradiction between card and certificate is warned about

When the type or modification recorded in the verification names a different instrument than the
card's own modification (or name), the card SHALL show a warning that the stored verification may
belong to another instrument, and SHALL NOT present the verification as plainly valid.

#### Scenario: Certificate of another instrument

- **WHEN** the card is «Измеритель влажности ИВТМ-7М» and the stored verification is of type
  «Манометры, вакуумметры и мановакуумметры»
- **THEN** the card warns that the verification may belong to another instrument

#### Scenario: Matching certificate

- **WHEN** the card's modification appears in the stored verification
- **THEN** no warning is shown

### Requirement: The warning never changes data by itself

Detecting a contradiction SHALL NOT modify the verification: it is reported to the operator, who
decides whether to re-fetch the verification from Arshin.

#### Scenario: Warning on a card

- **WHEN** a contradiction is detected
- **THEN** the stored verification stays untouched until the operator acts
