# Spec Delta

## Purpose

A folder rescan matches every instrument (and every ESI module) of an equipment folder against
FGIS Arshin, so that operators can review the verifications that changed since the record was last
touched and apply the ones they trust. A short serial, however, belongs to instruments of many
types, and the operator has to say which Arshin record is the one on the card.

## ADDED Requirements

### Requirement: Serial ambiguity carries its candidate list

When the serial recorded on the card is carried by more than one instrument in Arshin, the refresh
SHALL keep the instruments it found as candidates on the review row — each with its type number,
type title, modification, serial, certificate number, laboratory, verification date, valid date and
Arshin link — and SHALL keep the row for review. The row note SHALL state how many instruments carry
the serial and that a choice is required, and SHALL NOT list every type number.

#### Scenario: Several instruments carry the serial

- **WHEN** the serial on the card belongs to instruments of several types in Arshin
- **THEN** the row requires review
- **AND** the row carries the candidate list
- **AND** the note names the number of instruments rather than their types

#### Scenario: A single instrument carries the serial

- **WHEN** only one instrument in Arshin carries the serial
- **THEN** the row carries no candidate list
- **AND** the note carries no ambiguity sentence

### Requirement: The candidates are inspectable before applying

The review row SHALL expose its candidates with their type, modification, serial, certificate,
laboratory and dates, SHALL mark the candidate that is currently matched, and SHALL link each
candidate to its Arshin record.

#### Scenario: Inspecting an ambiguous row

- **WHEN** the operator opens the candidate list of a row whose serial is ambiguous
- **THEN** every candidate found by the refresh is listed with its type, modification, certificate,
  laboratory and verification dates
- **AND** the currently matched candidate is marked

#### Scenario: The offered certificate belongs to another laboratory

- **WHEN** the only newer record for the serial was issued by a laboratory other than the one that
  verified the instrument on the card
- **THEN** the list shows that laboratory, so the operator can tell the record is not theirs
- **AND** the row is not applied

### Requirement: Applying an ambiguous row requires a picked candidate

The refresh SHALL refuse to apply a row whose serial belongs to several instruments while no
candidate has been picked, and the refusal SHALL name that reason. Picking a candidate SHALL replace
the row's matched record — certificate, dates and Arshin link — with the picked one, and the choice
SHALL survive a page reload.

#### Scenario: Apply without a pick

- **WHEN** the operator applies an ambiguous row without picking a candidate
- **THEN** the row is not applied
- **AND** the message asks to pick the instrument whose certificate it is

#### Scenario: Pick, then apply

- **WHEN** the operator picks a candidate and applies the row
- **THEN** the picked verification is written to the instrument

### Requirement: Picking never relaxes the freshness rule

A candidate whose verification is older than the card's current verification SHALL be listed, so the
operator can identify the instrument, but SHALL NOT be applied; applying it SHALL be refused with the
existing message that a newer verification is required.

#### Scenario: An older candidate is picked

- **WHEN** the operator picks a candidate verified before the card's current verification and applies
  the row
- **THEN** the row is not applied
- **AND** the card keeps its current certificate

### Requirement: ESI module rows follow the same choice flow

An ESI composition row whose serial is ambiguous SHALL carry its candidates and require a pick in the
same way as an SI row.

#### Scenario: Ambiguous ESI module

- **WHEN** an ESI module's serial belongs to several instruments in Arshin
- **THEN** the module row carries candidates and requires a pick before it can be applied
