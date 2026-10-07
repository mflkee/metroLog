# Proposal

## Why

On 2026-10-07 the self-hosted runner `actions.runner.mflkee-metroLog.mkair-runner.service`
lost its connection to GitHub at 10:05 UTC and never reconnected, while the
systemd unit kept reporting `active/running`. GitHub therefore could not schedule
`deploy-staging`, and the CI run failed with a bare red X and no actionable
message. Deployments stayed blocked for hours until the runner was restarted by
hand.

## What Changes

- Add a **connection watchdog** that, for every configured self-hosted runner on
  the host (fleet-wide, e.g. `metroLog`, `metroCheck`, `metroGen`), periodically
  checks whether it is online and restarts its service when it is not, without
  human intervention.
- Harden the runner **systemd unit** with `Restart=always` so a crashed runner
  process also self-heals.
- Store the watchdog's GitHub token **outside the repository** with minimum
  scope and `0600` permissions.
- Add an **install script** (`scripts/server/setup-runner-watchdog.sh`) so the
  watchdog can be reproduced on the host.
- Make the CI pipeline **fail fast with a clear message** when the deploy job
  cannot start because the runner is offline, instead of an unexplained X.
- Document the failure mode and the recovery path in `AGENTS.md`.

## Capabilities

### New Capabilities
- `runner-availability`: how the deploy pipeline detects and recovers from an
  unavailable self-hosted runner, and how that state is made visible.

### Modified Capabilities
<!-- None: no existing capability requirements change. -->

## Impact

- **Server** (`mkair-server-tmn`): a new systemd timer + service unit running a
  watchdog script, plus `Restart=always` on the existing runner unit; a scoped
  GitHub token in `~/.config/metroLog/runner-watchdog.env` (`0600`).
- **Repository**: `scripts/server/runner-watchdog.sh`,
  `scripts/server/setup-runner-watchdog.sh`, `.github/workflows/ci.yml`
  (runner preflight job + secret), `AGENTS.md` troubleshooting notes.
- No application, backend or database changes.
