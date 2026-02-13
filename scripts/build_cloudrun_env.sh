#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/.env.generated}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing root env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

# Load centralized variable lists
. "$ROOT_DIR/scripts/constants.sh"

mkdir -p "$OUT_DIR"

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

yaml_escape() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" <<'PY'
import sys
value = sys.argv[1]
escaped = value.replace("\\\\", "\\\\\\\\").replace("\"", "\\\\\"")
print(f"\"{escaped}\"")
PY
    return
  fi
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '"%s"' "$v"
}

# For Prisma jobs, prefer Cloud SQL socket path if DB_INSTANCE is available
if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" && -n "${DB_INSTANCE:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DATABASE_URL_EFFECTIVE="postgresql://${ENCODED_USER}:${ENCODED_PASS}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
elif [[ -n "${DB_HOST:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DB_PORT_EFFECTIVE="${DB_PORT:-5432}"
  DATABASE_URL_EFFECTIVE="postgresql://${ENCODED_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT_EFFECTIVE}/${DB_NAME}?schema=public"
else
  DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
fi

if [[ -z "${DATABASE_URL_EFFECTIVE:-}" ]]; then
  echo "Missing DATABASE_URL (or DATABASE_URL_CLOUD/DB_*)" >&2
  exit 1
fi

WEB_ENV_FILE="$OUT_DIR/env.web.env"
WS_ENV_FILE="$OUT_DIR/env.ws.env"
PRISMA_ENV_FILE="$OUT_DIR/env.prisma.env"
WEB_ENV_YAML="$OUT_DIR/env.web.yaml"
WS_ENV_YAML="$OUT_DIR/env.ws.yaml"
PRISMA_ENV_YAML="$OUT_DIR/env.prisma.yaml"

# Generate Web Files
echo "Generating Web env files..."
: > "$WEB_ENV_FILE"
echo "SERVICE=web" >> "$WEB_ENV_FILE"
echo "NODE_ENV=production" >> "$WEB_ENV_FILE"
: > "$WEB_ENV_YAML"
echo "SERVICE: $(yaml_escape "web")" >> "$WEB_ENV_YAML"
echo "NODE_ENV: $(yaml_escape "production")" >> "$WEB_ENV_YAML"

for var in "${NEXT_PUBLIC_VARS[@]}"; do
  echo "$var=${!var:-}" >> "$WEB_ENV_FILE"
  echo "$var: $(yaml_escape "${!var:-}")" >> "$WEB_ENV_YAML"
done
# Special case
echo "WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID:-}" >> "$WEB_ENV_FILE"
echo "WALLETCONNECT_PROJECT_ID: $(yaml_escape "${WALLETCONNECT_PROJECT_ID:-}")" >> "$WEB_ENV_YAML"

# Generate WS Files
echo "Generating WS env files..."
: > "$WS_ENV_FILE"
echo "SERVICE=ws-server" >> "$WS_ENV_FILE"
echo "NODE_ENV=production" >> "$WS_ENV_FILE"
echo "DATABASE_URL=$DATABASE_URL_EFFECTIVE" >> "$WS_ENV_FILE"
: > "$WS_ENV_YAML"
echo "SERVICE: $(yaml_escape "ws-server")" >> "$WS_ENV_YAML"
echo "NODE_ENV: $(yaml_escape "production")" >> "$WS_ENV_YAML"
echo "DATABASE_URL: $(yaml_escape "$DATABASE_URL_EFFECTIVE")" >> "$WS_ENV_YAML"

for var in "${WS_VARS[@]}"; do
  if [[ "$var" != "DATABASE_URL" ]]; then
    echo "$var=${!var:-}" >> "$WS_ENV_FILE"
    echo "$var: $(yaml_escape "${!var:-}")" >> "$WS_ENV_YAML"
  fi
done

# Generate Prisma Files
echo "Generating Prisma env files..."
echo "NODE_ENV=production" > "$PRISMA_ENV_FILE"
echo "DATABASE_URL=$DATABASE_URL_EFFECTIVE" >> "$PRISMA_ENV_FILE"
echo "NODE_ENV: $(yaml_escape "production")" > "$PRISMA_ENV_YAML"
echo "DATABASE_URL: $(yaml_escape "$DATABASE_URL_EFFECTIVE")" >> "$PRISMA_ENV_YAML"

echo "Wrote files to $OUT_DIR"
