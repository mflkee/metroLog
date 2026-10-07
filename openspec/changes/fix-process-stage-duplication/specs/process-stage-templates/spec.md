# Spec Delta

## Purpose

Defines how a repair's or verification's stage list is composed from the folder's
selected template variant and the user's own custom stages, so that every stage
is presented exactly once and the two sources never overlap.

## ADDED Requirements

### Requirement: Single rendering of variant stages

When a repair or verification is created, the system SHALL present each stage of
the selected template variant exactly once. A stage SHALL NOT appear both as a
template stage and as a custom stage.

#### Scenario: Default offsite verification preset
- **WHEN** a verification is created with the default "С отправкой" preset
- **THEN** its stage list shows each of the seven preset stages once and no duplicate rows

#### Scenario: On-site verification preset
- **WHEN** a verification is created with an on-site preset
- **THEN** its stage list shows each preset stage once and no duplicate rows

#### Scenario: Repair preset
- **WHEN** a repair is created with an off-site or on-site preset
- **THEN** its stage list shows each preset stage once and no duplicate rows

### Requirement: Standard stages are template stages

Stages of the variant that correspond to the standard milestone keys of the
process flow SHALL be exposed as template stages, carrying their milestone date
fields.

#### Scenario: Standard stages are editable template rows
- **WHEN** a user opens a newly created verification with the offsite preset
- **THEN** the standard stages render as template rows with their milestone date inputs and without a delete action

### Requirement: Extra variant stages become custom stages

Stages of the variant that lie beyond the standard milestone keys of the process
flow SHALL be exposed as custom stages, exactly once, and SHALL be editable and
removable like user-added custom stages.

#### Scenario: Preset with an extra stage
- **WHEN** a folder preset variant defines more stages than the standard key set for its flow
- **THEN** each extra stage appears once as a custom stage and no extra stage appears as a template row

### Requirement: Custom stages start empty for standard variants

For a variant whose stage count equals the standard key count for its flow, the
process SHALL be created with no custom stages; custom stages SHALL contain only
entries the user adds afterwards.

#### Scenario: No seeded custom stages
- **WHEN** a verification is created with a standard-length preset
- **THEN** its custom stage list is empty until the user adds a stage

#### Scenario: User-added custom stage renders once
- **WHEN** a user adds a custom stage to a process
- **THEN** that stage renders once with a delete action and does not create a duplicate template row

### Requirement: Legacy seeded duplicates are cleaned up

Custom stages that were previously seeded from a variant's standard stages SHALL
be removed so existing processes also show each stage once. User-added custom
stages SHALL be preserved.

#### Scenario: Existing process with seeded duplicates
- **WHEN** an existing repair or verification created before the fix is loaded
- **THEN** its seeded duplicate custom stages are gone and any user-added custom stages remain

#### Scenario: Custom-stage dates are preserved
- **WHEN** legacy duplicates are cleaned up
- **THEN** dates recorded on genuine template milestones and on user-added custom stages are unchanged

### Requirement: Regression coverage

The rendering rules SHALL be covered by automated tests for repairs and
verifications, including a variant with more stages than the standard key set.

#### Scenario: Test guards against re-introduction
- **WHEN** the test suite runs
- **THEN** creating a process from a standard preset asserts that the number of rendered rows equals the number of variant stages
