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
: "${WEB_SERVICE_NAME:?Missing WEB_SERVICE_NAME}"

if [[ -z "${NEXT_PUBLIC_APP_URL:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  NEXT_PUBLIC_APP_URL="$WEB_PUBLIC_URL"
fi

if [[ -z "${NEXT_PUBLIC_API_URL:-}" && -n "${WS_PUBLIC_URL:-}" ]]; then
  NEXT_PUBLIC_API_URL="${WS_PUBLIC_URL%/}/api"
fi

if [[ -z "${NEXT_PUBLIC_WS_URL:-}" && -n "${WS_PUBLIC_URL:-}" ]]; then
  case "$WS_PUBLIC_URL" in
    https://*) NEXT_PUBLIC_WS_URL="wss://${WS_PUBLIC_URL#https://}" ;;
    http://*) NEXT_PUBLIC_WS_URL="ws://${WS_PUBLIC_URL#http://}" ;;
    ws://*|wss://*) NEXT_PUBLIC_WS_URL="$WS_PUBLIC_URL" ;;
    *) NEXT_PUBLIC_WS_URL="$WS_PUBLIC_URL" ;;
  esac
fi

: "${NEXT_PUBLIC_APP_URL:?Missing NEXT_PUBLIC_APP_URL or WEB_PUBLIC_URL}"
: "${NEXT_PUBLIC_WS_URL:?Missing NEXT_PUBLIC_WS_URL or WS_PUBLIC_URL}"
: "${NEXT_PUBLIC_API_URL:?Missing NEXT_PUBLIC_API_URL or WS_PUBLIC_URL}"

WEB_PORT="${WEB_PORT:-8080}"

ENV_VARS=(
  "SERVICE=web"
  "NODE_ENV=production"
  "PORT=${WEB_PORT}"
  "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
  "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}"
  "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
)

if [[ -n "${WALLETCONNECT_PROJECT_ID:-}" ]]; then
  ENV_VARS+=("WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}")
fi

join_env_vars() {
  local IFS=';'
  echo "${ENV_VARS[*]}"
}

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WEB_SERVICE_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

gcloud builds submit "$ROOT_DIR" --tag "$IMAGE_URI" --file "$ROOT_DIR/Dockerfile"

gcloud run deploy "$WEB_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="^;^$(join_env_vars)"

echo "Deployed web service: $WEB_SERVICE_NAME"
