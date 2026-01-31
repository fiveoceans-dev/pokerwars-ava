#!/usr/bin/env bash
set -euo pipefail

echo "🧪 Test Database Connection Setup"
echo "================================"

# Load environment
if [[ -f .env ]]; then
  set -a
  . .env
  set +a
  echo "✅ Loaded .env"
else
  echo "❌ No .env file"
  exit 1
fi

echo ""
echo "🔧 Environment Variables:"
echo "  PROJECT_ID: ${PROJECT_ID:-}"
echo "  REGION: ${REGION:-}"
echo "  DB_INSTANCE: ${DB_INSTANCE:-}"
echo "  DB_NAME: ${DB_NAME:-}"
echo "  DB_USER: ${DB_USER:-}"
echo "  DB_PASSWORD: [HIDDEN]"
echo ""

# Test DATABASE_URL construction (same logic as scripts)
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

if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DATABASE_URL="postgresql://${ENCODED_USER}:${ENCODED_PASS}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

  echo "✅ Constructed DATABASE_URL:"
  echo "  $DATABASE_URL"
  echo ""

  echo "🧪 Testing connection (requires Cloud SQL proxy or VPC access):"
  echo "  psql \"$DATABASE_URL\" -c \"SELECT version();\""
  echo ""
  echo "📋 To test with Cloud SQL proxy:"
  echo "  cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
  echo "  Then run: psql 'postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME' -c \"SELECT version();\""
else
  echo "❌ Missing required DB variables for construction"
fi
