# Spec Delta

## Purpose

Defines how the running metroLog web app presents its version and release
channel, so users and support can identify the exact build and know it is a beta.

## ADDED Requirements

### Requirement: Version badge in the header

The web app SHALL display its version and a beta marker statically in the
application header, visible on every authenticated page and without requiring a
network request.

#### Scenario: Authenticated user sees the version
- **WHEN** an authenticated user opens any page of the app
- **THEN** the header shows the product name together with the version and a beta marker

#### Scenario: Badge is static
- **WHEN** the page loads
- **THEN** the version is already present in the rendered markup and does not depend on a backend or network call

### Requirement: Single source of version

The displayed version SHALL come from one source of truth and SHALL match the
version of the shipped build.

#### Scenario: Version matches the published package
- **WHEN** the frontend is built with a given package version
- **THEN** the header shows exactly that version

#### Scenario: Version bump is reflected automatically
- **WHEN** the package version is changed and the frontend is rebuilt
- **THEN** the header shows the new version without any other code change

### Requirement: Beta channel is visible

The app SHALL mark itself as a beta channel while its version is below `1.0.0`.

#### Scenario: Beta marker present
- **WHEN** the app version is below `1.0.0`
- **THEN** the header indicates the beta channel next to the version
