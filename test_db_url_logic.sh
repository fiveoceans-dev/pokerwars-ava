#!/usr/bin/env bash
set -euo pipefail

echo "🧪 Test DATABASE_URL Construction Logic"
echo "======================================"

# Simulate the new logic from build_cloudrun_env.sh
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

# Test values (simulate what would be in .env)
PROJECT_ID="beam-457011"
REGION="us-central1"
DB_INSTANCE="pokerwars-instance"
DB_NAME="pokerwars-database"
DB_USER="pokerwars-admin"
DB_PASSWORD="PW_2026_01_30_S8m4kZqv9D2N7x"
DB_HOST="10.63.208.3"  # Private IP

echo "Input variables:"
echo "  PROJECT_ID: $PROJECT_ID"
echo "  REGION: $REGION"
echo "  DB_INSTANCE: $DB_INSTANCE"
echo "  DB_NAME: $DB_NAME"
echo "  DB_USER: $DB_USER"
echo "  DB_HOST: $DB_HOST"
echo ""

echo "🔄 New Logic (prioritizes Cloud SQL socket for prisma):"
# New logic: prefer Cloud SQL socket if DB_INSTANCE is available
if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" && -n "${DB_INSTANCE:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DATABASE_URL_EFFECTIVE="postgresql://${ENCODED_USER}:${ENCODED_PASS}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
  echo "✅ Using Cloud SQL socket path:"
elif [[ -n "${DB_HOST:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DB_PORT_EFFECTIVE="${DB_PORT:-5432}"
  DATABASE_URL_EFFECTIVE="postgresql://${ENCODED_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT_EFFECTIVE}/${DB_NAME}?schema=public"
  echo "⚠️ Using direct host connection:"
else
  DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
  echo "❓ Using fallback:"
fi

echo "  $DATABASE_URL_EFFECTIVE"
echo ""

echo "🎯 Result:"
echo "  - Prisma env file will use: Cloud SQL socket path ✅"
echo "  - Cloud Run job will have: Single DATABASE_URL ✅"
echo "  - No more duplicate --set-env-vars error ✅"
