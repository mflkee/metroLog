# Tasks

## 1. Watchdog logic and script

- [x] 1.1 Add `scripts/server/runner-watchdog.sh` that reads the runner state from the GitHub runners API, applies the D4 safety rules (offline + not busy + two consecutive checks + cooldown) and restarts the service; verify `--dry-run` mode reports the decision without restarting (shellcheck not available locally; `bash -n` + self-test used instead).
- [x] 1.2 Extract the decision logic into a testable form and add tests covering: online → no action, offline+busy → skip, offline idle twice → restart, offline within cooldown → skip, missing token → error and no restart; verify the tests pass (embedded `--self-test` plus a stubbed end-to-end run).
- [x] 1.3 Make the repo/runner name and service name configurable and exit non-zero with a clear message on any unrecoverable error; verify the exit codes in the tests.

## 2. systemd units and installation

- [x] 2.1 Add `scripts/server/runner-watchdog.service` and `runner-watchdog.timer` (5-minute cadence) and the `Restart=always`/`RestartSec=15` hardening for the runner unit; verify `systemd-analyze verify` accepts the units and the drop-in applies (`Restart=always`, `RestartUSec=15s`).
- [x] 2.2 Add `scripts/server/setup-runner-watchdog.sh` that installs the units, creates `/etc/metroLog/runner-watchdog.env` with `0600` when missing, enables the timer and prints verification steps; verify running it on the deploy host leaves the timer `active`.
- [x] 2.3 Confirm the token file is never referenced from any tracked file and document the required token scope in the script header; verify with a grep over the repository.

## 3. Pipeline feedback

- [x] 3.1 Add a `runner-preflight` job to `.github/workflows/ci.yml` that polls the runners API for an online `mkair-runner` for the grace period and fails with an explicit message otherwise, and make `deploy-staging`/`deploy-prod` depend on it; verify the workflow YAML is valid.
- [ ] 3.2 Document the `RUNNER_STATUS_TOKEN` repository secret and its scope; verify a run where the runner is offline shows the explicit message and one where it is online proceeds.
- [x] 3.3 Update `AGENTS.md` troubleshooting with the silent-disconnect failure mode, the watchdog, the token location and the manual recovery command; verify the section is reachable from the repo root.

## 4. Integration checks

- [x] 4.1 Install the watchdog on `mkair-server-tmn` covering all host runners (`metroLog`, `metroCheck`, `metroGen`): verify the timer is enabled and active, `TARGETS` lists all three, and every runner is online.
- [x] 4.2 Simulate the failure by stopping the `metroGen` runner service; verify the watchdog restarts it and the runner returns to `online` (observed: offline after ~20s, streak confirmed on the first run, restarted on the second, back online).
- [x] 4.3 Trigger a `main` push during normal operation and confirm `deploy-staging` runs without any preflight delay (CI run #22: `runner-preflight` and `deploy-staging` both succeeded).
