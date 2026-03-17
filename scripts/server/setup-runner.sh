#!/usr/bin/env bash
set -euo pipefail

REPO="mflkee/metroLog"
RUNNER_VERSION="2.323.0"
ARCH="x64"

mkdir -p ~/actions-runner
cd ~/actions-runner

echo "Downloading GitHub Actions runner v${RUNNER_VERSION}..."
curl -fsSLo actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz"

echo "Extracting..."
tar xzf actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz
rm -f actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz

cat <<EOF

========================================
Runner downloaded to ~/actions-runner

Next steps:
1. Go to:
   https://github.com/${REPO}/settings/actions/runners/new

2. Choose "New self-hosted runner", OS = Linux, Arch = x64

3. Copy the --token value from the page.

4. Register the runner:
   cd ~/actions-runner
   ./config.sh --url https://github.com/${REPO} --token <TOKEN> --name mkair-server --labels mkair --runnergroup default --work _work

5. Install as systemd user service:
   ./svc.sh install --user
   ./svc.sh start --user

6. Verify it is listening:
   ./svc.sh status --user

Or run once manually (foreground):
   ./run.sh
========================================
EOF
