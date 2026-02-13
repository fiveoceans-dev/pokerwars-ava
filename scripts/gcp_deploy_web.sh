#!/usr/bin/env bash
set -euo pipefail

# Wrapper for gcp_deploy.sh focused on the web service

export SERVICE_TYPE="web"
export SERVICE_NAME="${WEB_SERVICE_NAME:-}"

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Missing WEB_SERVICE_NAME" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/gcp_deploy.sh"
