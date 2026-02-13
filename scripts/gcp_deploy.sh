#!/usr/bin/env bash
set -euo pipefail

# Main deployment script for GCP Cloud Run
# Focuses on: Building images and Deploying services.
# Infra setup is delegated to gcp_setup_infra.sh (idempotent).

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

# Run infra setup once (idempotent checks)
if [[ "${SKIP_INFRA:-}" != "true" ]]; then
  "$ROOT_DIR/scripts/gcp_setup_infra.sh"
fi

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

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME:$IMAGE_TAG"

# Build URLs
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

if [[ "$SERVICE_TYPE" == "web" ]]; then
  if [[ -z "$NEXT_PUBLIC_APP_URL" || -z "$NEXT_PUBLIC_WS_URL" || -z "$NEXT_PUBLIC_API_URL" ]]; then
    echo "Missing NEXT_PUBLIC_* URLs for web deploy." >&2
    exit 1
  fi
fi

# Load centralized variable lists for build-time substitutions
. "$ROOT_DIR/scripts/constants.sh"
SUBS_STR="$("$ROOT_DIR/scripts/get_gcloud_substitutions.sh" "$IMAGE_URI" "$SERVICE_TYPE")"

echo "🚀 Submitting build for $SERVICE_TYPE to Cloud Build..."
gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="$SUBS_STR"

# Generate Cloud Run env file
ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"
ENV_FILE_PATH="$ENV_OUT_DIR/env.web.yaml"
if [[ "$SERVICE_TYPE" == "ws-server" ]]; then
  ENV_FILE_PATH="$ENV_OUT_DIR/env.ws.yaml"
fi

# Run Prisma Migrations (Cloud Run Job) for ws-server
if [[ "$SERVICE_TYPE" == "ws-server" ]]; then
  AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
  if [[ "${SKIP_MIGRATE:-}" == "1" || "${SKIP_MIGRATE:-}" == "true" ]]; then
    echo "⏩ Skipping migrations (SKIP_MIGRATE=true)"
  elif [[ "${AUTO_MIGRATE}" == "1" || "${AUTO_MIGRATE}" == "true" ]]; then
    echo "🏃 Running Prisma migrations via Cloud Run Job..."
    IMAGE_FOR_JOB="$IMAGE_URI" \
    ENV_FILE_FOR_JOB="$ENV_FILE_PATH" \
    DB_INSTANCE="${DB_INSTANCE:-}" \
    AUTO_SEED="${AUTO_SEED:-true}" \
    AUTO_GRANT_DB="${AUTO_GRANT_DB:-}" \
    "$ROOT_DIR/scripts/run_prisma_job.sh"
  fi
fi

DEPLOY_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --env-vars-file="$ENV_FILE_PATH"
)

if [[ -n "${VPC_CONNECTOR:-}" && "${USE_VPC_CONNECTOR:-}" == "true" ]]; then
  DEPLOY_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
  if [[ -n "${VPC_EGRESS:-}" ]]; then
    DEPLOY_ARGS+=(--vpc-egress "$VPC_EGRESS")
  fi
fi

if [[ "$SERVICE_TYPE" == "ws-server" && -n "${DB_INSTANCE:-}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")
fi

echo "📦 Deploying $SERVICE_TYPE service: $SERVICE_NAME..."
gcloud run deploy "$SERVICE_NAME" "${DEPLOY_ARGS[@]}"

echo "✅ Deployed $SERVICE_TYPE service: $SERVICE_NAME"
