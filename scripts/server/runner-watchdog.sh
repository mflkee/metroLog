#!/usr/bin/env bash
#
# metroLog self-hosted runner availability watchdog.
#
# GitHub can lose the long-poll connection to a self-hosted runner while the
# systemd unit keeps reporting "active", so *Restart=always* alone does not
# recover it. This watchdog asks GitHub for the runner's authoritative status and
# restarts the runner service when the runner is offline and idle.
#
# Configuration (env file, defaults shown):
#   GITHUB_TOKEN       - fine-grained PAT with "Administration: read" (required)
#   REPO               - mflkee/metroLog
#   RUNNER_NAME        - mkair-runner
#   RUNNER_SERVICE     - actions.runner.mflkee-metroLog.mkair-runner.service
#   COOLDOWN_SECONDS   - 600 (minimum gap between restarts)
#   REQUIRED_STREAK    - 2 (consecutive offline checks before restarting)
#   STATE_DIR          - /var/lib/metroLog/runner-watchdog
#
# Usage:
#   runner-watchdog.sh [--dry-run] [--self-test]
#
set -euo pipefail

ENV_FILE="${RUNNER_WATCHDOG_ENV:-/etc/metroLog/runner-watchdog.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

REPO="${REPO:-mflkee/metroLog}"
RUNNER_NAME="${RUNNER_NAME:-mkair-runner}"
RUNNER_SERVICE="${RUNNER_SERVICE:-actions.runner.mflkee-metroLog.mkair-runner.service}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-600}"
REQUIRED_STREAK="${REQUIRED_STREAK:-2}"
STATE_DIR="${STATE_DIR:-/var/lib/metroLog/runner-watchdog}"

DRY_RUN=0
SELF_TEST=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --self-test) SELF_TEST=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

log() {
  printf '%s runner-watchdog: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# Pure decision function: given the runner state, decide what to do.
#   status: online | offline | unknown
#   busy:   true | false
#   streak: number of consecutive offline observations (including this one)
#   cooldown_remaining: seconds left before a restart is allowed (0 = allowed)
decide_action() {
  local status="$1" busy="$2" streak="$3" cooldown_remaining="$4"
  if [ "$status" = "online" ]; then
    echo "ok"
    return 0
  fi
  if [ "$status" != "offline" ]; then
    echo "unknown"
    return 0
  fi
  if [ "$busy" = "true" ]; then
    echo "skip-busy"
    return 0
  fi
  if [ "$streak" -lt "$REQUIRED_STREAK" ]; then
    echo "confirm"
    return 0
  fi
  if [ "$cooldown_remaining" -gt 0 ]; then
    echo "skip-cooldown"
    return 0
  fi
  echo "restart"
}

fetch_runner_state() {
  # Echoes "<status> <busy>", exits non-zero on missing token or API failure.
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    log "GITHUB_TOKEN is not set (check $ENV_FILE)"
    return 1
  fi
  local json
  if ! json=$(curl -fsS --max-time 30 \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/runners?name=$RUNNER_NAME"); then
    log "GitHub runners API request failed for $REPO"
    return 1
  fi
  printf '%s' "$json" | python3 -c '
import json
import sys

name = sys.argv[1]
try:
    data = json.load(sys.stdin)
except ValueError:
    print("unknown false")
    raise SystemExit(0)

for runner in data.get("runners", []):
    if runner.get("name") == name:
        status = runner.get("status") or "unknown"
        busy = "true" if runner.get("busy") else "false"
        print(f"{status} {busy}")
        break
else:
    print("unknown false")
' "$RUNNER_NAME"
}

read_int_file() {
  local path="$1"
  if [ -f "$path" ]; then
    tr -dc '0-9' <"$path" || true
  fi
}

self_test() {
  local failures=0
  assert_action() {
    local expected="$1"; shift
    local actual
    actual="$(decide_action "$@")"
    if [ "$actual" != "$expected" ]; then
      echo "FAIL: decide_action($*) = '$actual', expected '$expected'" >&2
      failures=$((failures + 1))
    fi
  }
  assert_action ok online false 5 0
  assert_action unknown unknown false 5 0
  assert_action skip-busy offline true 5 0
  assert_action confirm offline false 1 0
  assert_action restart offline false 2 0
  assert_action restart offline false 3 0
  assert_action skip-cooldown offline false 5 42
  if [ "$failures" -eq 0 ]; then
    echo "self-test: all checks passed"
    return 0
  fi
  echo "self-test: $failures check(s) failed" >&2
  return 1
}

main() {
  local status busy streak=0 last_restart=0 now cooldown_remaining action

  local state
  if ! state="$(fetch_runner_state)"; then
    return 1
  fi
  status="${state%% *}"
  busy="${state##* }"

  mkdir -p "$STATE_DIR"
  streak="$(read_int_file "$STATE_DIR/offline_streak")"
  streak="${streak:-0}"
  last_restart="$(read_int_file "$STATE_DIR/last_restart")"
  last_restart="${last_restart:-0}"
  now="$(date +%s)"

  cooldown_remaining=$((last_restart + COOLDOWN_SECONDS - now))
  if [ "$cooldown_remaining" -lt 0 ]; then
    cooldown_remaining=0
  fi

  if [ "$status" = "online" ] || [ "$busy" = "true" ]; then
    streak=0
  else
    streak=$((streak + 1))
  fi

  action="$(decide_action "$status" "$busy" "$streak" "$cooldown_remaining")"

  case "$action" in
    ok)
      log "runner '$RUNNER_NAME' is online"
      ;;
    unknown)
      log "runner '$RUNNER_NAME' state unknown (not found or API issue)"
      printf '%s' "$streak" >"$STATE_DIR/offline_streak"
      return 1
      ;;
    skip-busy)
      log "runner '$RUNNER_NAME' busy; skipping restart"
      ;;
    confirm)
      log "runner '$RUNNER_NAME' offline (streak $streak/$REQUIRED_STREAK); waiting for confirmation"
      ;;
    skip-cooldown)
      log "runner '$RUNNER_NAME' offline but within cooldown (${cooldown_remaining}s left)"
      ;;
    restart)
      if [ "$DRY_RUN" -eq 1 ]; then
        log "would restart $RUNNER_SERVICE (dry-run)"
      else
        log "restarting $RUNNER_SERVICE (runner offline, streak $streak)"
        if ! systemctl restart "$RUNNER_SERVICE"; then
          log "failed to restart $RUNNER_SERVICE"
          return 1
        fi
        printf '%s' "$now" >"$STATE_DIR/last_restart"
        streak=0
      fi
      ;;
  esac

  printf '%s' "$streak" >"$STATE_DIR/offline_streak"
  return 0
}

if [ "$SELF_TEST" -eq 1 ]; then
  self_test
  exit $?
fi

main
exit $?
