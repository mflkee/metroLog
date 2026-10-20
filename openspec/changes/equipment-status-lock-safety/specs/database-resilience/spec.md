# Spec Delta

## Purpose

Keep a database lock, a slow statement or a stalled transaction from freezing the whole service, and
keep read operations genuinely read-only so that opening a screen can never block other users.

## ADDED Requirements

### Requirement: Read operations MUST NOT write equipment statuses

Reading the equipment registry or a single equipment card SHALL be a read-only operation: it MUST NOT
issue an `UPDATE equipment` (or any other status rewrite) as a side effect of being read.

#### Scenario: Listing equipment does not modify rows

- **WHEN** a user opens the equipment registry, filters it, or paginates through it
- **THEN** the request reads equipment rows only and leaves `equipment.status` untouched

#### Scenario: Opening an equipment card does not modify rows

- **WHEN** a user opens an equipment card
- **THEN** the request reads the equipment row (and its related data) without writing to `equipment`

### Requirement: Stale transient statuses SHALL be healed outside the read path

Equipment that is marked as in repair or in verification while no active repair and no active
verification exists SHALL be moved back to the working status without delay on the request path that
created that situation, and stale data left over from an earlier failure MUST be healed once when the
application starts.

#### Scenario: Closing the last process restores the working status

- **WHEN** a user closes a repair or a verification and no other active process remains for that equipment
- **THEN** the equipment status becomes the working status as part of that same operation

#### Scenario: Start-up heals leftovers

- **WHEN** the application starts and some equipment is still marked in repair or in verification without
  an active process
- **THEN** those rows are normalised once at start-up, and only one application instance performs the
  normalisation

### Requirement: Database statements MUST be bounded in time

Every database connection the application opens SHALL carry an explicit statement timeout, a lock
timeout and an idle-in-transaction timeout, configurable through settings, so that a waiting statement
fails with an error instead of waiting indefinitely.

#### Scenario: A blocked statement is cut, not hung

- **WHEN** a statement waits for a lock longer than the configured lock timeout
- **THEN** the statement fails with an error and the request finishes, and the connection is not held
  by the wait

#### Scenario: An abandoned transaction is terminated

- **WHEN** a request finishes its database work but leaves the transaction open longer than the
  configured idle-in-transaction timeout
- **THEN** the database terminates that session, releasing its locks, instead of keeping them forever

### Requirement: Streaming a file MUST NOT hold a database transaction

A response that streams a stored file SHALL release its database session before the bytes are sent, so
that a slow client cannot keep row locks (or a pooled connection) for the duration of the transfer.

#### Scenario: Slow download does not pin a transaction

- **WHEN** a user downloads an attachment over a slow connection
- **THEN** the download holds no open database transaction while the file is transferred
