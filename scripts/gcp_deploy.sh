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

urlencode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
    return
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
    return
  fi
  echo "$1"
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
NEXT_PUBLIC_DEFAULT_NETWORK="${NEXT_PUBLIC_DEFAULT_NETWORK:-}"

if [[ "$SERVICE_TYPE" == "web" ]]; then
  if [[ -z "$NEXT_PUBLIC_APP_URL" || -z "$NEXT_PUBLIC_WS_URL" || -z "$NEXT_PUBLIC_API_URL" ]]; then
    echo "Missing NEXT_PUBLIC_* URLs for web deploy. Set NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_WS_URL/NEXT_PUBLIC_API_URL or WEB_PUBLIC_URL/WS_PUBLIC_URL." >&2
    exit 1
  fi
fi

gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.yaml" \
  --substitutions=_IMAGE_URI="$(escape_subs "$IMAGE_URI")",_BUILD_TARGET="$(escape_subs "$SERVICE_TYPE")",_NEXT_PUBLIC_APP_NAME="$(escape_subs "${NEXT_PUBLIC_APP_NAME:-}")",_NEXT_PUBLIC_APP_DESCRIPTION="$(escape_subs "${NEXT_PUBLIC_APP_DESCRIPTION:-}")",_NEXT_PUBLIC_APP_URL="$(escape_subs "${NEXT_PUBLIC_APP_URL:-}")",_NEXT_PUBLIC_WS_URL="$(escape_subs "${NEXT_PUBLIC_WS_URL:-}")",_NEXT_PUBLIC_API_URL="$(escape_subs "${NEXT_PUBLIC_API_URL:-}")",_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="$(escape_subs "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}")",_NEXT_PUBLIC_DEFAULT_NETWORK="$(escape_subs "${NEXT_PUBLIC_DEFAULT_NETWORK:-}")",_NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID:-}")",_NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME:-}")",_NEXT_PUBLIC_HYPERLIQUID_RPC_URL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_RPC_URL:-}")",_NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL:-}")",_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME:-}")",_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL:-}")",_NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS:-}")",_NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL="$(escape_subs "${NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL:-}")"

# Deploy
ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"
ENV_FILE_PATH="$ENV_OUT_DIR/env.web.yaml"
if [[ "$SERVICE_TYPE" == "ws-server" ]]; then
  ENV_FILE_PATH="$ENV_OUT_DIR/env.ws.yaml"
fi

DEPLOY_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --env-vars-file="$ENV_FILE_PATH"
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
