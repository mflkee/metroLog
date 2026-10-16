# Spec Delta

## Purpose

A folder rescan matches every instrument (and every ESI module) of an equipment folder against
FGIS Arshin, so that operators can review the verifications that changed since the record was last
touched and apply the ones they trust.

## ADDED Requirements

### Requirement: Serial-scoped lookup stays authoritative

When the instrument-parameter lookup returns records for the serial number recorded in the current
verification, the refresh SHALL match using that serial filter and SHALL NOT flag the row for review
because of the serial.

#### Scenario: Serial spelling unchanged

- **WHEN** Arshin stores the new verification with the same serial spelling as the current record
- **THEN** the row is offered as a regular update
- **AND** the row note carries no serial-mismatch explanation

### Requirement: Fallback lookup without the serial filter

When the instrument-parameter lookup returns no record for the current serial, the refresh SHALL
repeat the lookup without the serial filter and SHALL validate the returned records against the
current serial itself.

#### Scenario: Spaces added around the separator

- **WHEN** the current serial is `21202377-19011936` and Arshin's new verification holds
  `21202377 - 19011936`
- **THEN** the row offers that verification as an update

#### Scenario: Nothing matches even without the serial filter

- **WHEN** none of the returned records carries a compatible serial
- **THEN** the row stays `UNCHANGED` and the current certificate is kept

### Requirement: Normalized serial equality is a confident match

A candidate SHALL be accepted without a review request when its serial equals the current one after
normalization (case, spaces and punctuation ignored) or after folding Latin and Cyrillic look-alike
letters.

#### Scenario: Look-alike letters across alphabets

- **WHEN** the current serial is `C133358228` with a Latin `C` and the new record holds
  `С133358228` with a Cyrillic `С`
- **THEN** the row is offered as a regular update

### Requirement: Digit-only serial equality requires review

When a candidate serial equals the current one in its digits only, the refresh SHALL offer it for
review instead of a silent update: the row SHALL be marked uncertain and its note SHALL name both
spellings.

#### Scenario: Letter added to the serial

- **WHEN** the current serial is `418007` and the new record holds `L418007`
- **THEN** the row status requires review
- **AND** the note names `418007` and `L418007`

### Requirement: Ambiguous digit-only candidates are reported

When several candidates match the current serial by digits only, the refresh SHALL report the
ambiguity in the row note and SHALL still require review.

#### Scenario: Two instruments share the digits

- **WHEN** records with serials `L418007` and `Р418007` are both newer than the current verification
- **THEN** the row requires review
- **AND** the note states that several records match the serial

### Requirement: Candidates are never older than the current verification

The serial-tolerant fallback SHALL NOT weaken the existing rule that a candidate is accepted only
when its verification date is not earlier than the current one.

#### Scenario: Only older records exist

- **WHEN** every record returned for the instrument was verified before the current certificate
- **THEN** the row stays `UNCHANGED`

### Requirement: ESI modules follow the same matching rules

Matching an ESI composition entry SHALL apply the same serial-compatibility rules, including the
review requirement for digit-only equality.

#### Scenario: ESI module with a drifted serial

- **WHEN** an ESI module's new record spells the serial differently from the module's current
  verification
- **THEN** the module row is matched by the same compatibility rules as an SI instrument
