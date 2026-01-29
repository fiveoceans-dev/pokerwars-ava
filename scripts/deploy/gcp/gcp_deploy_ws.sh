#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${WS_SERVICE_NAME:?Missing WS_SERVICE_NAME}"
: "${DATABASE_URL:?Missing DATABASE_URL}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID}" # required for web auth flows hitting ws auth

if [[ -z "${ALLOWED_WS_ORIGINS:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  ALLOWED_WS_ORIGINS="$WEB_PUBLIC_URL"
fi

: "${ALLOWED_WS_ORIGINS:?Missing ALLOWED_WS_ORIGINS or WEB_PUBLIC_URL}"

WS_PORT="${WS_PORT:-8080}"

ENV_VARS=(
  "SERVICE=ws-server"
  "NODE_ENV=production"
  "PORT=${WS_PORT}"
  "ALLOWED_WS_ORIGINS=${ALLOWED_WS_ORIGINS}"
  "DATABASE_URL=${DATABASE_URL}"
  "WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}"
)

if [[ -n "${REDIS_URL:-}" ]]; then
  ENV_VARS+=("REDIS_URL=${REDIS_URL}")
fi

if [[ -n "${RECONNECT_GRACE_SECONDS:-}" ]]; then
  ENV_VARS+=("RECONNECT_GRACE_SECONDS=${RECONNECT_GRACE_SECONDS}")
fi

if [[ -n "${WS_MAX_PAYLOAD:-}" ]]; then
  ENV_VARS+=("WS_MAX_PAYLOAD=${WS_MAX_PAYLOAD}")
fi

join_env_vars() {
  local IFS=';'
  echo "${ENV_VARS[*]}"
}

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WS_SERVICE_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

gcloud builds submit "$ROOT_DIR" --tag "$IMAGE_URI" --file "$ROOT_DIR/Dockerfile"

gcloud run deploy "$WS_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars="^;^$(join_env_vars)"

echo "Deployed ws service: $WS_SERVICE_NAME"
