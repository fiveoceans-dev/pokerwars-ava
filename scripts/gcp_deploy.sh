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
: "${SERVICE_NAME:?Missing SERVICE_NAME (set to web or ws service name)}"
: "${SERVICE_TYPE:?Missing SERVICE_TYPE (web|ws-server)}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID}"

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

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

# Optional Cloud SQL creation (safe, no-op if exists)
if [[ "${CREATE_CLOUDSQL:-}" == "true" && -n "${DB_INSTANCE:-}" ]]; then
  if ! gcloud sql instances describe "$DB_INSTANCE" >/dev/null 2>&1; then
    gcloud sql instances create "$DB_INSTANCE" \
      --region "$REGION" \
      --database-version=POSTGRES_15 \
      --tier "${DB_TIER:-db-f1-micro}"
  fi
  if [[ -n "${DB_NAME:-}" ]]; then
    gcloud sql databases create "$DB_NAME" --instance "$DB_INSTANCE" >/dev/null 2>&1 || true
  fi
fi

# Optional VPC connector
if [[ "${CREATE_VPC_CONNECTOR:-}" == "true" && -n "${VPC_CONNECTOR:-}" ]]; then
  if ! gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" --region "$REGION" >/dev/null 2>&1; then
    gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
      --region "$REGION" \
      --network "${VPC_NETWORK:-default}" \
      --range "${VPC_RANGE:-10.8.0.0/28}"
  fi
fi

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME:$IMAGE_TAG"

# Build
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
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-$WALLETCONNECT_PROJECT_ID}"

if [[ -z "$NEXT_PUBLIC_APP_URL" || -z "$NEXT_PUBLIC_WS_URL" || -z "$NEXT_PUBLIC_API_URL" ]]; then
  echo "Missing NEXT_PUBLIC_* URLs for build. Set NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_WS_URL/NEXT_PUBLIC_API_URL or WEB_PUBLIC_URL/WS_PUBLIC_URL." >&2
  exit 1
fi

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions=_IMAGE_URI="$(escape_subs "$IMAGE_URI")",_BUILD_TARGET="$(escape_subs "$SERVICE_TYPE")",_NEXT_PUBLIC_APP_URL="$(escape_subs "$NEXT_PUBLIC_APP_URL")",_NEXT_PUBLIC_WS_URL="$(escape_subs "$NEXT_PUBLIC_WS_URL")",_NEXT_PUBLIC_API_URL="$(escape_subs "$NEXT_PUBLIC_API_URL")",_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="$(escape_subs "$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")",_WALLETCONNECT_PROJECT_ID="$(escape_subs "$WALLETCONNECT_PROJECT_ID")"

# Deploy
ENV_VARS=(
  "SERVICE=${SERVICE_TYPE}"
  "NODE_ENV=production"
  "WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}"
)
if [[ "$SERVICE_TYPE" == "web" ]]; then
  ENV_VARS+=(
    "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
    "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}"
    "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}"
  )
else
  DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
  : "${DATABASE_URL_EFFECTIVE:?Missing DATABASE_URL or DATABASE_URL_CLOUD}"
  : "${ALLOWED_WS_ORIGINS:?Missing ALLOWED_WS_ORIGINS}"
  ENV_VARS+=(
    "DATABASE_URL=${DATABASE_URL_EFFECTIVE}"
    "ALLOWED_WS_ORIGINS=${ALLOWED_WS_ORIGINS}"
  )
fi

join_env_vars() { local IFS=';'; echo "${ENV_VARS[*]}"; }

DEPLOY_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --set-env-vars="^;^$(join_env_vars)"
)

if [[ -n "${VPC_CONNECTOR:-}" ]]; then
  DEPLOY_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
  if [[ -n "${VPC_EGRESS:-}" ]]; then
    DEPLOY_ARGS+=(--vpc-egress "$VPC_EGRESS")
  fi
fi

if [[ "$SERVICE_TYPE" == "ws-server" && -n "${DB_INSTANCE:-}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")
fi

gcloud run deploy "$SERVICE_NAME" "${DEPLOY_ARGS[@]}"

echo "Deployed $SERVICE_TYPE service: $SERVICE_NAME"
