#!/usr/bin/env bash
set -euo pipefail

# Wrapper for gcp_deploy.sh focused on the ws-server service

export SERVICE_TYPE="ws-server"
export SERVICE_NAME="${WS_SERVICE_NAME:-}"

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Missing WS_SERVICE_NAME" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/gcp_deploy.sh"
