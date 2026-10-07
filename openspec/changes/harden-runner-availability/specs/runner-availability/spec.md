# Spec Delta

## Purpose

Defines how the metroLog deploy pipeline detects a self-hosted runner that has
lost its connection to GitHub and recovers from it automatically, and how that
state is surfaced to operators instead of an unexplained red X.

## ADDED Requirements

### Requirement: Automatic recovery from a lost connection

The system SHALL periodically determine whether this repository's self-hosted
runner is online, and SHALL restart the runner service automatically when the
runner is offline and is not executing a job.

#### Scenario: Runner reconnect is restored automatically
- **WHEN** the runner's GitHub status is `offline` and it is not busy
- **THEN** the watchdog restarts the runner service and the runner returns to `Listening for Jobs` without human action

#### Scenario: Healthy runner is left alone
- **WHEN** the runner's GitHub status is `online`
- **THEN** the watchdog performs no restart

### Requirement: Restart safety

The watchdog SHALL NOT restart the runner while it is executing a job, SHALL
require an observed offline state (not a single transient blip), and SHALL
apply a cooldown so repeated checks do not cause a restart storm.

#### Scenario: Busy runner is not restarted
- **WHEN** the runner is busy running a job
- **THEN** the watchdog skips the restart and records that it skipped

#### Scenario: Transient failure is tolerated
- **WHEN** a single check fails to confirm the runner state
- **THEN** the watchdog does not restart on that check alone

#### Scenario: Cooldown prevents a restart storm
- **WHEN** the runner is restarted and the next check still reports it offline within the cooldown window
- **THEN** the watchdog waits before restarting again

### Requirement: Scoped, external credentials

The watchdog SHALL authenticate with a token that has only the permission needed
to read this repository's runners, and SHALL read it from a file outside the
repository with `0600` permissions.

#### Scenario: Missing token is a clean failure
- **WHEN** the token file is absent or unreadable
- **THEN** the watchdog exits with a clear error message and performs no restart

#### Scenario: Token never enters the repository
- **WHEN** the watchdog is installed
- **THEN** no token value is written into any tracked file

### Requirement: Process-level resilience

The runner systemd unit SHALL restart the runner process automatically after a
crash or exit.

#### Scenario: Crashed process comes back
- **WHEN** the runner process is killed
- **THEN** systemd restarts the unit and the runner reconnects

### Requirement: Observability of the watchdog

Each watchdog run SHALL record its decision, and restarts and failures SHALL be
visible to an operator through the system journal.

#### Scenario: Restart is logged
- **WHEN** the watchdog restarts the runner
- **THEN** a journal entry records the reason, the previous status and the action

#### Scenario: Persistent failure is visible
- **WHEN** the watchdog cannot recover the runner
- **THEN** the failure is visible in the journal with a non-zero exit status

### Requirement: Reproducible installation

The repository SHALL provide a script that installs the watchdog and its systemd
units on a host that already runs the runner and verifies the installation.

#### Scenario: Install on the deploy host
- **WHEN** the install script is run on the deploy host
- **THEN** the watchdog timer is enabled and active and the runner service is verified to be running

### Requirement: Clear pipeline feedback

The deploy workflow SHALL detect an unavailable runner and fail with an explicit
message, allowing a short grace period for the runner to come back, instead of
failing with no explanation.

#### Scenario: Runner offline before deploy
- **WHEN** the deploy job cannot be scheduled because the runner is offline
- **THEN** the workflow reports that the runner is offline and waits for the grace period before failing

#### Scenario: Runner recovers within the grace period
- **WHEN** the runner returns online during the grace period
- **THEN** the deploy proceeds normally
