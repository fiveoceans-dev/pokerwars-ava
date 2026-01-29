#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
  echo "Loaded env from $ENV_FILE"
fi

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${WS_SERVICE_NAME:?Missing WS_SERVICE_NAME}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID}"
: "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:=${WALLETCONNECT_PROJECT_ID}}"

sanitize() {
  echo "$1" | tr -d "\"'\r\n"
}

first_csv() {
  local value
  value="$(sanitize "$1")"
  if [[ "$value" == *","* ]]; then
    value="${value%%,*}"
  fi
  echo "$value"
}

escape_subs() {
  local value
  value="$(sanitize "$1")"
  value="${value//\\/\\\\}"
  value="${value//,/\\,}"
  value="${value//=/\\=}"
  echo "$value"
}

DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
: "${DATABASE_URL_EFFECTIVE:?Missing DATABASE_URL or DATABASE_URL_CLOUD}"

if [[ -z "${ALLOWED_WS_ORIGINS:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  ALLOWED_WS_ORIGINS="$WEB_PUBLIC_URL"
fi

: "${ALLOWED_WS_ORIGINS:?Missing ALLOWED_WS_ORIGINS or WEB_PUBLIC_URL}"

# Normalize comma-separated origins (take first entry)
if [[ "${ALLOWED_WS_ORIGINS}" == *","* ]]; then
  ALLOWED_WS_ORIGINS="${ALLOWED_WS_ORIGINS%%,*}"
fi

if [[ -z "${NEXT_PUBLIC_APP_URL:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  NEXT_PUBLIC_APP_URL="$(first_csv "$WEB_PUBLIC_URL")"
fi
if [[ -z "${NEXT_PUBLIC_API_URL:-}" && -n "${WS_PUBLIC_URL:-}" ]]; then
  NEXT_PUBLIC_API_URL="$(first_csv "$WS_PUBLIC_URL")"
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL%/}/api"
fi
if [[ -z "${NEXT_PUBLIC_WS_URL:-}" && -n "${WS_PUBLIC_URL:-}" ]]; then
  WS_PUBLIC_URL_FIRST="$(first_csv "$WS_PUBLIC_URL")"
  case "$WS_PUBLIC_URL_FIRST" in
    https://*) NEXT_PUBLIC_WS_URL="wss://${WS_PUBLIC_URL_FIRST#https://}" ;;
    http://*) NEXT_PUBLIC_WS_URL="ws://${WS_PUBLIC_URL_FIRST#http://}" ;;
    ws://*|wss://*) NEXT_PUBLIC_WS_URL="$WS_PUBLIC_URL_FIRST" ;;
    *) NEXT_PUBLIC_WS_URL="$WS_PUBLIC_URL_FIRST" ;;
  esac
fi

NEXT_PUBLIC_APP_URL="$(first_csv "${NEXT_PUBLIC_APP_URL:-}")"
NEXT_PUBLIC_WS_URL="$(first_csv "${NEXT_PUBLIC_WS_URL:-}")"
NEXT_PUBLIC_API_URL="$(first_csv "${NEXT_PUBLIC_API_URL:-}")"

WS_PORT="${WS_PORT:-8080}"

ENV_VARS=(
  "SERVICE=ws-server"
  "NODE_ENV=production"
  "ALLOWED_WS_ORIGINS=${ALLOWED_WS_ORIGINS}"
  "DATABASE_URL=${DATABASE_URL_EFFECTIVE}"
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

SAN_APP_URL="$(sanitize "$NEXT_PUBLIC_APP_URL")"
SAN_WS_URL="$(sanitize "$NEXT_PUBLIC_WS_URL")"
SAN_API_URL="$(sanitize "$NEXT_PUBLIC_API_URL")"
SAN_WC_PUBLIC="$(sanitize "$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")"
SAN_WC="$(sanitize "$WALLETCONNECT_PROJECT_ID")"

SAN_APP_URL="$(first_csv "$SAN_APP_URL")"
SAN_WS_URL="$(first_csv "$SAN_WS_URL")"
SAN_API_URL="$(first_csv "$SAN_API_URL")"

if [[ -z "$SAN_APP_URL" || -z "$SAN_WS_URL" || -z "$SAN_API_URL" ]]; then
  echo "Missing NEXT_PUBLIC_* URLs for build. Set NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_WS_URL/NEXT_PUBLIC_API_URL or WEB_PUBLIC_URL/WS_PUBLIC_URL." >&2
  exit 1
fi

echo "Substitutions:"
echo "_NEXT_PUBLIC_APP_URL=$SAN_APP_URL"
echo "_NEXT_PUBLIC_WS_URL=$SAN_WS_URL"
echo "_NEXT_PUBLIC_API_URL=$SAN_API_URL"
echo "_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$SAN_WC_PUBLIC"
echo "_WALLETCONNECT_PROJECT_ID=$SAN_WC"

SUBS="_IMAGE_URI=$(escape_subs "$IMAGE_URI"),_BUILD_TARGET=ws-server,_NEXT_PUBLIC_APP_URL=$(escape_subs "$SAN_APP_URL"),_NEXT_PUBLIC_WS_URL=$(escape_subs "$SAN_WS_URL"),_NEXT_PUBLIC_API_URL=$(escape_subs "$SAN_API_URL"),_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$(escape_subs "$SAN_WC_PUBLIC"),_WALLETCONNECT_PROJECT_ID=$(escape_subs "$SAN_WC")"

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="$SUBS"

DEPLOY_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --timeout=3600
  --set-env-vars="^;^$(join_env_vars)"
)

if [[ -n "${DB_INSTANCE:-}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")
fi

gcloud run deploy "$WS_SERVICE_NAME" "${DEPLOY_ARGS[@]}"

echo "Deployed ws service: $WS_SERVICE_NAME"
