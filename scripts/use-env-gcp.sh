#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.gcp}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

: "${PROJECT_ID:?Missing PROJECT_ID in $ENV_FILE}"
: "${REGION:?Missing REGION in $ENV_FILE}"

gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
gcloud config set run/region "$REGION"

echo "Updated gcloud config to project=$PROJECT_ID region=$REGION using $ENV_FILE"
