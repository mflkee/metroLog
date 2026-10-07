# Design

## Context

See `proposal.md` — Why. Facts that shape the approach:

- The deploy host `mkair-server-tmn` runs several near-identical runners
  (`mflkee-metroLog.mkair-runner`, `mflkee-metroCheck.mkair-runner`,
  `mflkee-metroGen.mkair-runner`), all labelled `mkair`.
- The failure mode is a **silent lost session**: the `Runner.Listener` process
  stayed alive and the unit reported `active`, so `Restart=always` alone would
  not have fired. The log showed a broker long-poll timeout
  (`broker.actions.githubusercontent.com/message ... timed out after 100 seconds`)
  followed by retries and periodic auth refreshes, but never a new
  `Listening for Jobs`.
- `build-images` runs on a GitHub-hosted runner and is unaffected; only the
  self-hosted `deploy-staging` / `deploy-prod` jobs depend on the runner.
- The repository is public, but reading runner status through the GitHub API
  still requires a token with runner administration read access.

## Goals / Non-Goals

**Goals:**

- Recover from a silently disconnected runner without human action.
- Surface an offline runner as a clear, actionable pipeline signal.
- Keep credentials minimal and out of the repository.

**Non-Goals:**

- Replacing the self-hosted runner with GitHub-hosted deploy runners (the deploy
  needs host access).
- Making the GitHub-hosted build depend on the self-hosted runner.
- Managing runners for the other repositories on the host (can follow later).

## Decisions

### D1: Watchdog driven by a systemd timer

`scripts/server/runner-watchdog.sh` runs from a systemd timer every 5 minutes;
the logic is a small pure function (given runner state + previous action, decide
skip/restart) that is unit-testable without the host. *Alternative:* a long-lived
daemon — rejected as unnecessary moving parts.

### D2: Liveness comes from the GitHub runners API

Query `GET /repos/{owner}/{repo}/actions/runners?name=<runner-name>` and read the
runner's `status` (`online`/`offline`) and `busy`. This is the authoritative
signal and distinguishes "idle but connected" from "stuck offline". *Alternative:*
parse the local `_diag` logs — rejected because an idle, healthy runner is
indistinguishable from a stuck one by log silence alone.

### D3: One scoped token covering every target repo

A PAT with **Administration: read** on each guarded repository (a single
fine-grained token can select several repos), stored at
`/etc/metroLog/runner-watchdog.env` (`0600`, root-owned because the watchdog runs
as a system service). The install script never writes the token into any tracked
file. *Alternative:* a classic token with the broad `repo` scope — rejected for
being over-privileged.

### D4: Restart safety rules

Restart only when the runner is `offline`, not `busy`, confirmed on two
consecutive checks, and not within a 10-minute cooldown after a restart. Each
outcome is logged. *Alternative:* unconditional periodic restart — rejected as
disruptive and it hides the real signal.

### D5: Process-level hardening

Set `Restart=always` and `RestartSec=15` on the runner unit for the case where
the process actually exits; this complements the watchdog for the silent case.

### D6: Fail-fast preflight in the workflow

Add a `runner-preflight` job that runs on `ubuntu-latest`, polls the runners API
for up to a grace period (e.g. 10 minutes) for an online `mkair-runner`, and
fails with an explicit message if it stays offline. `deploy-staging`/`deploy-prod`
`needs` it. It uses a repository secret `RUNNER_STATUS_TOKEN` (the same scoped
read permission). *Alternative:* rely on the watchdog alone — rejected because a
run that starts during the offline window still fails with no explanation.

## Risks / Trade-offs

- [Token is powerful and lives on the host] → minimum scope, `0600` root-owned,
  outside the repo, and only readable by root; rotate on compromise.
- [Restart storm or restart during a job] → D4 safety rules (busy check, double
  confirmation, cooldown).
- [GitHub API rate limits] → a 5-minute cadence is far below the limit.
- [Watchdog false positive on a transient network blip] → two consecutive
  offline checks before acting.
- [A second secret (`RUNNER_STATUS_TOKEN`) to manage] → documented; it is the same
  scoped read token and can be rotated alongside the host copy.
- [Other runners on the host stay unguarded] → noted as a follow-up; the script is
  parameterised by repo/runner name so it can be extended.

## Migration Plan

1. Add the watchdog script, its unit files and the install script to the repo.
2. Install on `mkair-server-tmn`, set the token file, enable the timer.
3. Add the `runner-preflight` job and the `RUNNER_STATUS_TOKEN` secret.
4. Verify by stopping the runner service and confirming the watchdog restarts it
   and a deploy succeeds.
5. Rollback: disable the timer and remove the preflight job/secret; the runner is
   unaffected.

## Open Questions

- What grace period should the preflight wait before failing? Start at 10 minutes;
  tune from observed recovery times. (The watchdog now covers every runner on the
  host — `metroLog`, `metroCheck`, `metroGen` — via the `TARGETS` list.)
