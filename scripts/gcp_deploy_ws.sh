#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"
ENV_FILES=(
  "$ROOT_DIR/apps/web/.env"
  "$ROOT_DIR/.env.gcp"
  "$ENV_FILE"
  "$ROOT_DIR/.env"
)

for f in "${ENV_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    set -a
    . "$f"
    set +a
    echo "Loaded env from $f"
  fi
done

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${WS_SERVICE_NAME:?Missing WS_SERVICE_NAME}"
: "${DATABASE_URL:?Missing DATABASE_URL}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID}"

if [[ -z "${ALLOWED_WS_ORIGINS:-}" && -n "${WEB_PUBLIC_URL:-}" ]]; then
  ALLOWED_WS_ORIGINS="$WEB_PUBLIC_URL"
fi

: "${ALLOWED_WS_ORIGINS:?Missing ALLOWED_WS_ORIGINS or WEB_PUBLIC_URL}"

# Normalize comma-separated origins (take first entry)
if [[ "${ALLOWED_WS_ORIGINS}" == *","* ]]; then
  ALLOWED_WS_ORIGINS="${ALLOWED_WS_ORIGINS%%,*}"
fi

# Normalize comma-separated Next.js URLs if present (from web env)
if [[ "${NEXT_PUBLIC_WS_URL:-}" == *","* ]]; then
  NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL%%,*}"
fi
if [[ "${NEXT_PUBLIC_API_URL:-}" == *","* ]]; then
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL%%,*}"
fi

WS_PORT="${WS_PORT:-8080}"

ENV_VARS=(
  "SERVICE=ws-server"
  "NODE_ENV=production"
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

sanitize() {
  echo "$1" | tr -d "\"'\r\n"
}

ensure_nonempty() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing required value for $name" >&2
    exit 1
  fi
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

# Resolve variable references like $WEB_PUBLIC_URL in env (basic replacement)
if [[ "${SAN_APP_URL}" == *"\$WEB_PUBLIC_URL"* ]]; then
  SAN_APP_URL="${SAN_APP_URL/\$WEB_PUBLIC_URL/${WEB_PUBLIC_URL%%,*}}"
fi
if [[ "${SAN_API_URL}" == *"\$WS_PUBLIC_URL"* ]]; then
  SAN_API_URL="${SAN_API_URL/\$WS_PUBLIC_URL/${WS_PUBLIC_URL%%,*}}"
fi

ensure_nonempty "_NEXT_PUBLIC_APP_URL" "$SAN_APP_URL"
ensure_nonempty "_NEXT_PUBLIC_WS_URL" "$SAN_WS_URL"
ensure_nonempty "_NEXT_PUBLIC_API_URL" "$SAN_API_URL"
ensure_nonempty "_WALLETCONNECT_PROJECT_ID" "$SAN_WC"

SUBS="_IMAGE_URI=$(sanitize "$IMAGE_URI"),_BUILD_TARGET=ws-server,_NEXT_PUBLIC_APP_URL=$SAN_APP_URL,_NEXT_PUBLIC_WS_URL=$SAN_WS_URL,_NEXT_PUBLIC_API_URL=$SAN_API_URL,_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$SAN_WC_PUBLIC,_WALLETCONNECT_PROJECT_ID=$SAN_WC"

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="$SUBS"

gcloud run deploy "$WS_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars="^;^$(join_env_vars)"

echo "Deployed ws service: $WS_SERVICE_NAME"
