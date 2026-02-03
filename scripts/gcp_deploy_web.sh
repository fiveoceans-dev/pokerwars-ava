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
: "${WEB_SERVICE_NAME:?Missing WEB_SERVICE_NAME}"
: "${WALLETCONNECT_PROJECT_ID:?Missing WALLETCONNECT_PROJECT_ID (set in .env/.env.gcp)}"
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

: "${NEXT_PUBLIC_APP_URL:?Missing NEXT_PUBLIC_APP_URL or WEB_PUBLIC_URL}"
: "${NEXT_PUBLIC_WS_URL:?Missing NEXT_PUBLIC_WS_URL or WS_PUBLIC_URL}"
: "${NEXT_PUBLIC_API_URL:?Missing NEXT_PUBLIC_API_URL or WS_PUBLIC_URL}"

WEB_PORT="${WEB_PORT:-8080}"

ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"
WEB_ENV_FILE="$ENV_OUT_DIR/env.web.yaml"

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WEB_SERVICE_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

# Build with explicit Next.js envs (sanitized)
SUBS=(
  "_IMAGE_URI=$(escape_subs "$IMAGE_URI")"
  "_BUILD_TARGET=web"
  "_NEXT_PUBLIC_APP_NAME=$(escape_subs "${NEXT_PUBLIC_APP_NAME:-}")"
  "_NEXT_PUBLIC_APP_DESCRIPTION=$(escape_subs "${NEXT_PUBLIC_APP_DESCRIPTION:-}")"
  "_NEXT_PUBLIC_APP_URL=$(escape_subs "$NEXT_PUBLIC_APP_URL")"
  "_NEXT_PUBLIC_WS_URL=$(escape_subs "$NEXT_PUBLIC_WS_URL")"
  "_NEXT_PUBLIC_API_URL=$(escape_subs "$NEXT_PUBLIC_API_URL")"
  "_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$(escape_subs "$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")"
  "_NEXT_PUBLIC_DEFAULT_NETWORK=$(escape_subs "${NEXT_PUBLIC_DEFAULT_NETWORK:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_RPC_URL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_RPC_URL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS:-}")"
  "_NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL=$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL:-}")"
)
IFS=,
SUBS_STR="${SUBS[*]}"
unset IFS

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="$SUBS_STR"

gcloud run deploy "$WEB_SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --timeout=1800 \
  --env-vars-file="$WEB_ENV_FILE"

echo "Deployed web service: $WEB_SERVICE_NAME"
