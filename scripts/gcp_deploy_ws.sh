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

sanitize() { echo "$1" | tr -d "\"'\r\n"; }

first_csv() {
  local value
  value="$(sanitize "$1")"
  [[ "$value" == *","* ]] && value="${value%%,*}"
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

# ----------------------------
# Derived env
# ----------------------------
if [[ -z "${ALLOWED_WS_ORIGINS:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  ALLOWED_WS_ORIGINS="$WEB_PUBLIC_URL"
fi
: "${ALLOWED_WS_ORIGINS:?Missing ALLOWED_WS_ORIGINS or WEB_PUBLIC_URL}"

[[ "${ALLOWED_WS_ORIGINS}" == *","* ]] && ALLOWED_WS_ORIGINS="${ALLOWED_WS_ORIGINS%%,*}"

NEXT_PUBLIC_APP_URL="$(first_csv "${NEXT_PUBLIC_APP_URL:-${WEB_PUBLIC_URL:-}}")"
NEXT_PUBLIC_WS_URL="$(first_csv "${NEXT_PUBLIC_WS_URL:-${WS_PUBLIC_URL:-}}")"
NEXT_PUBLIC_API_URL="$(first_csv "${NEXT_PUBLIC_API_URL:-${WS_PUBLIC_URL:-}}")"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL%/}/api"

WS_PORT="${WS_PORT:-8080}"

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WS_SERVICE_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

# ----------------------------
# Build image
# ----------------------------
SUBS="_IMAGE_URI=$(escape_subs "$IMAGE_URI"),_BUILD_TARGET=ws-server"

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="$SUBS"

# ----------------------------
# Generate Cloud Run env file
# ----------------------------
ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"
WS_ENV_FILE="$ENV_OUT_DIR/env.ws.yaml"

# ----------------------------
# Run Prisma Migrations (Cloud Run Job)
# ----------------------------
if [[ "${AUTO_MIGRATE:-}" == "1" || "${AUTO_MIGRATE:-}" == "true" ]]; then
  echo "Running Prisma migrations via Cloud Run Job..."

  if [[ "${AUTO_GRANT_DB:-}" == "1" || "${AUTO_GRANT_DB:-}" == "true" ]]; then
    "$ROOT_DIR/scripts/db_grant.sh"
  fi

  IMAGE_FOR_JOB="$IMAGE_URI" \
  ENV_FILE_FOR_JOB="$WS_ENV_FILE" \
  DB_INSTANCE="$DB_INSTANCE" \
  "$ROOT_DIR/scripts/run_prisma_job.sh"
fi

# ----------------------------
# Deploy WebSocket service
# ----------------------------
DEPLOY_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --timeout=3600
  --env-vars-file="$WS_ENV_FILE"
)

if [[ -n "${DB_INSTANCE:-}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")
fi

if [[ "${USE_VPC_CONNECTOR:-}" == "true" && -n "${VPC_CONNECTOR:-}" ]]; then
  DEPLOY_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
  [[ -n "${VPC_EGRESS:-}" ]] && DEPLOY_ARGS+=(--vpc-egress "$VPC_EGRESS")
fi

gcloud run deploy "$WS_SERVICE_NAME" "${DEPLOY_ARGS[@]}"

echo "Deployed ws service: $WS_SERVICE_NAME"
