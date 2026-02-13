#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${ENV_FILE:-}" ]]; then
  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    ENV_FILE="$ROOT_DIR/.env.local"
  else
    ENV_FILE="$ROOT_DIR/.env"
  fi
fi
WEB_ENV_FILE="${WEB_ENV_FILE:-$ROOT_DIR/apps/web/.env.local}"
WS_ENV_FILE="${WS_ENV_FILE:-$ROOT_DIR/apps/ws-server/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing root env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

# Load centralized variable lists
. "$ROOT_DIR/scripts/constants.sh"

# Generate Web Env
echo "Generating $WEB_ENV_FILE..."
: > "$WEB_ENV_FILE"
for var in "${NEXT_PUBLIC_VARS[@]}"; do
  echo "$var=${!var:-}" >> "$WEB_ENV_FILE"
done
# Include WALLETCONNECT_PROJECT_ID as a special case if not prefixed
echo "WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID:-}" >> "$WEB_ENV_FILE"

# Generate WS Env
echo "Generating $WS_ENV_FILE..."
: > "$WS_ENV_FILE"
for var in "${WS_VARS[@]}"; do
  echo "$var=${!var:-}" >> "$WS_ENV_FILE"
done

echo "Wrote $WEB_ENV_FILE"
echo "Wrote $WS_ENV_FILE"
