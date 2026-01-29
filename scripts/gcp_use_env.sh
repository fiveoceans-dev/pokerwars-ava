#!/usr/bin/env bash
set -euo pipefail

# Load .env for GCP config (PROJECT_ID, REGION, optional ZONE)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

if [ -z "${PROJECT_ID:-}" ] || [ -z "${REGION:-}" ]; then
  echo "Missing PROJECT_ID or REGION. Add them to .env or export before running."
  exit 1
fi

ZONE_DEFAULT="${ZONE:-}"

echo "Setting gcloud config from .env..."
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
gcloud config set compute/region "$REGION"
if [ -n "$ZONE_DEFAULT" ]; then
  gcloud config set compute/zone "$ZONE_DEFAULT"
fi

echo "Active gcloud configuration:"
gcloud config list --format='text(core.project,run.region,compute.region,compute.zone)'
