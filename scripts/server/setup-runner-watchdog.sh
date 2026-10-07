#!/usr/bin/env bash
#
# Install the metroLog fleet runner availability watchdog on a host that runs
# one or more self-hosted GitHub Actions runners.
#
# Run as root. Installs:
#   - /usr/local/lib/metroLog/runner-watchdog.sh
#   - /etc/systemd/system/runner-watchdog.{service,timer}
#   - /etc/metroLog/runner-watchdog.env        (0600, template if missing)
#   - a Restart=always drop-in for every detected runner service
# and enables the timer. Detected runners are written to TARGETS in the env file.
#
set -euo pipefail

REPO="${REPO:-mflkee/metroLog}"
RUNNER_NAME="${RUNNER_NAME:-mkair-runner}"
RUNNER_SERVICE="${RUNNER_SERVICE:-actions.runner.mflkee-metroLog.mkair-runner.service}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR=/usr/local/lib/metroLog
ENV_DIR=/etc/metroLog
UNIT_DIR=/etc/systemd/system

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run as root (systemd system units)" >&2
  exit 1
fi

# Discover active self-hosted runners on this host.
# Unit name: actions.runner.<owner>-<repo>.<runner-name>.service
detected_services() {
  systemctl list-units --type=service --state=running --no-legend 'actions.runner.*.service' 2>/dev/null \
    | awk '{print $1}' | sort -u
}

service_to_target() {
  local unit="$1" rest owner_repo owner repo name
  rest="${unit#actions.runner.}"
  owner_repo="${rest%%.*}"
  name="${rest#*.}"
  name="${name%.service}"
  owner="${owner_repo%%-*}"
  repo="${owner_repo#*-}"
  printf '%s %s %s\n' "$owner/$repo" "$name" "$unit"
}

mapfile -t SERVICES < <(detected_services)
TARGETS_LINES=""
for unit in "${SERVICES[@]:-}"; do
  [ -n "$unit" ] || continue
  TARGETS_LINES+="$(service_to_target "$unit")"$'\n'
done

install -d -m 0755 "$LIB_DIR" "$ENV_DIR"
install -m 0755 "$SRC_DIR/runner-watchdog.sh" "$LIB_DIR/runner-watchdog.sh"
install -m 0644 "$SRC_DIR/runner-watchdog.service" "$UNIT_DIR/runner-watchdog.service"
install -m 0644 "$SRC_DIR/runner-watchdog.timer" "$UNIT_DIR/runner-watchdog.timer"

if [ ! -f "$ENV_DIR/runner-watchdog.env" ]; then
  (
    umask 077
    cat >"$ENV_DIR/runner-watchdog.env" <<EOF
# metroLog runner availability watchdog configuration.
# Fill GITHUB_TOKEN with a PAT that can read "runners" for every repo below
# (fine-grained: Administration: read), then the timer starts recovering.
GITHUB_TOKEN=
REPO=$REPO
RUNNER_NAME=$RUNNER_NAME
RUNNER_SERVICE=$RUNNER_SERVICE
# One "<repo> <runner-name> <systemd-service>" line per runner to guard.
TARGETS="
${TARGETS_LINES}"
EOF
  )
  chmod 0600 "$ENV_DIR/runner-watchdog.env"
  echo "created $ENV_DIR/runner-watchdog.env (0600)"
else
  echo "kept existing $ENV_DIR/runner-watchdog.env"
fi

# Process-level resilience for every runner unit on this host.
if [ "${#SERVICES[@]}" -gt 0 ]; then
  for unit in "${SERVICES[@]}"; do
    dropin_dir="$UNIT_DIR/$unit.d"
    install -d -m 0755 "$dropin_dir"
    cat >"$dropin_dir/override.conf" <<'EOF'
[Service]
Restart=always
RestartSec=15
EOF
    echo "hardened $unit (Restart=always)"
  done
else
  echo "warning: no running actions.runner.*.service units detected" >&2
fi

systemctl daemon-reload
systemctl enable --now runner-watchdog.timer

echo "--- detected targets ---"
printf '%s' "$TARGETS_LINES"
echo "--- verification ---"
systemctl is-active runner-watchdog.timer
systemctl list-timers runner-watchdog.timer --no-pager | head -n 3
"$LIB_DIR/runner-watchdog.sh" --self-test
echo "done; if GITHUB_TOKEN is empty, edit $ENV_DIR/runner-watchdog.env then run:"
echo "  systemctl restart runner-watchdog.timer"
