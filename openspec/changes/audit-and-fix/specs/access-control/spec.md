# Spec Delta

## Purpose

Defines who may read and modify folder-scoped data in metroLog, so that access is
enforced by the backend regardless of what the user interface offers.

## ADDED Requirements

### Requirement: Folder-scoped access
Every folder-scoped endpoint SHALL restrict data to folders the caller may access. Roles
`ADMINISTRATOR` and `DEVELOPER` SHALL have access to all folders; `MKAIR` and `CUSTOMER`
SHALL be limited to their allowed folders.

#### Scenario: Denied folder is indistinguishable from a missing one
- **WHEN** a caller requests a folder, equipment item or task outside their allowed folders
- **THEN** the backend responds `404` and does not reveal that the resource exists

#### Scenario: Administrator bypasses folder scoping
- **WHEN** a user with role `ADMINISTRATOR` or `DEVELOPER` requests data from any folder
- **THEN** the backend returns the data regardless of the allowed-folder configuration

### Requirement: Role-gated write operations
Endpoints that change data SHALL reject callers whose role is not permitted, with a
`403` response, even when the user interface does not offer the action.

#### Scenario: Customer cannot mutate
- **WHEN** a user with role `CUSTOMER` calls a write endpoint that creates, updates or deletes data
- **THEN** the backend responds `403` and performs no change

#### Scenario: Operator can mutate within allowed folders
- **WHEN** a user with role `MKAIR` calls a write endpoint for an allowed folder
- **THEN** the change is applied

### Requirement: Private notes are operator-only
Private notes in equipment comments and task discussions SHALL be creatable and readable
only by operators. Non-operators SHALL receive `403` when attempting to create one and
SHALL NOT receive other users' private notes in list responses.

#### Scenario: Customer cannot create a private note
- **WHEN** a user with role `CUSTOMER` submits a comment or message flagged private
- **THEN** the backend responds `403`

#### Scenario: Customer does not see private notes
- **WHEN** a user with role `CUSTOMER` lists comments or discussion messages
- **THEN** the response contains none of another user's private notes

### Requirement: Mention candidates are scoped to the caller
The list of users offered as mention candidates SHALL be limited to the caller's scope.
Administrators and developers SHALL see every active user; other roles SHALL see only users
who share at least one accessible folder with them (administrators and developers remain
visible because they oversee every folder). User email addresses SHALL NOT be disclosed
outside that scope.

#### Scenario: Customer sees only colleagues from their folders
- **WHEN** a user with role `CUSTOMER` requests the mention-candidate list
- **THEN** the response contains only users who share at least one of the caller's accessible folders, and no other users' email addresses

#### Scenario: Administrator sees the whole directory
- **WHEN** a user with role `ADMINISTRATOR` or `DEVELOPER` requests the mention-candidate list
- **THEN** the response contains every active user
