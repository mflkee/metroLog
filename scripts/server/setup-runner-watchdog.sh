#!/usr/bin/env bash
#
# Install the metroLog self-hosted runner availability watchdog.
#
# Run as root on the deploy host. Installs:
#   - /usr/local/lib/metroLog/runner-watchdog.sh
#   - /etc/systemd/system/runner-watchdog.{service,timer}
#   - /etc/metroLog/runner-watchdog.env        (0600, template if missing)
#   - a Restart=always drop-in for the runner service
# and enables the timer.
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

install -d -m 0755 "$LIB_DIR" "$ENV_DIR"
install -m 0755 "$SRC_DIR/runner-watchdog.sh" "$LIB_DIR/runner-watchdog.sh"
install -m 0644 "$SRC_DIR/runner-watchdog.service" "$UNIT_DIR/runner-watchdog.service"
install -m 0644 "$SRC_DIR/runner-watchdog.timer" "$UNIT_DIR/runner-watchdog.timer"

if [ ! -f "$ENV_DIR/runner-watchdog.env" ]; then
  (
    umask 077
    cat >"$ENV_DIR/runner-watchdog.env" <<EOF
# metroLog runner availability watchdog configuration.
# Fill GITHUB_TOKEN with a fine-grained PAT that has "Administration: read"
# for the repository, then the timer will start recovering the runner.
GITHUB_TOKEN=
REPO=$REPO
RUNNER_NAME=$RUNNER_NAME
RUNNER_SERVICE=$RUNNER_SERVICE
EOF
  )
  chmod 0600 "$ENV_DIR/runner-watchdog.env"
  echo "created $ENV_DIR/runner-watchdog.env (0600) — set GITHUB_TOKEN"
else
  echo "kept existing $ENV_DIR/runner-watchdog.env"
fi

# Process-level resilience for the runner unit itself.
DROPIN_DIR="$UNIT_DIR/$RUNNER_SERVICE.d"
install -d -m 0755 "$DROPIN_DIR"
cat >"$DROPIN_DIR/override.conf" <<EOF
[Service]
Restart=always
RestartSec=15
EOF

systemctl daemon-reload
systemctl enable --now runner-watchdog.timer

echo "--- verification ---"
systemctl is-active runner-watchdog.timer
systemctl list-timers runner-watchdog.timer --no-pager | head -n 3
"$LIB_DIR/runner-watchdog.sh" --self-test
echo "done; if GITHUB_TOKEN is empty, edit $ENV_DIR/runner-watchdog.env then run:"
echo "  systemctl restart runner-watchdog.timer"
