#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"
ALT_ENV_FILES=("$ROOT_DIR/.env" "$ROOT_DIR/apps/web/.env")

load_env() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    . "$file"
    set +a
    echo "Loaded env from $file"
    return 0
  fi
  return 1
}

if ! load_env "$ENV_FILE"; then
  for f in "${ALT_ENV_FILES[@]}"; do
    if load_env "$f"; then
      break
    fi
  done
fi

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${WEB_SERVICE_NAME:?Missing WEB_SERVICE_NAME}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID (set in .env/.env.gcp/apps/web/.env)}"
: "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:=${WALLETCONNECT_PROJECT_ID}}"

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
  "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
  "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}"
  "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
  "WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}"
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}"
)

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

# Use Dockerfile directly (Cloud Build default)
gcloud builds submit "$ROOT_DIR" --tag "$IMAGE_URI"

gcloud run deploy "$WEB_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --timeout=1800 \
  --set-env-vars="^;^$(join_env_vars)"

echo "Deployed web service: $WEB_SERVICE_NAME"
