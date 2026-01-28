#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${API_SERVICE_NAME:?Missing API_SERVICE_NAME}"
: "${REPO_NAME:?Missing REPO_NAME}"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$API_SERVICE_NAME:$IMAGE_TAG"

gcloud builds submit "$ROOT_DIR" --tag "$IMAGE_URI" --file "$ROOT_DIR/apps/api/Dockerfile"

ENV_VARS="PORT=8080"
if [[ -n "${DATABASE_URL_CLOUD:-}" ]]; then
  ENV_VARS="${ENV_VARS},DATABASE_URL=${DATABASE_URL_CLOUD}"
elif [[ -n "${DATABASE_URL:-}" ]]; then
  ENV_VARS="${ENV_VARS},DATABASE_URL=${DATABASE_URL}"
fi

CLOUDSQL_FLAGS=()
if [[ -n "${DB_INSTANCE:-}" ]]; then
  CLOUDSQL_FLAGS+=(--set-cloudsql-instances "$PROJECT_ID:$REGION:$DB_INSTANCE")
fi

VPC_FLAGS=()
if [[ -n "${VPC_CONNECTOR:-}" ]]; then
  VPC_FLAGS+=(--vpc-connector "$VPC_CONNECTOR" --vpc-egress all-traffic)
fi

gcloud run deploy "$API_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "$ENV_VARS" \
  "${CLOUDSQL_FLAGS[@]}" \
  "${VPC_FLAGS[@]}"
