#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Local Database Grant Fix for Private IP Cloud SQL"
echo "===================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
  echo "✅ Loaded environment from $ENV_FILE"
else
  echo "❌ No .env file found at $ENV_FILE"
  exit 1
fi

echo ""

# Check current configuration
echo "🔍 Current Database Configuration:"
echo "  DB_HOST: ${DB_HOST:-'Not set'}"
echo "  DB_ADMIN_USER: ${DB_ADMIN_USER:-'Not set'}"
echo "  DATABASE_URL_ADMIN: ${DATABASE_URL_ADMIN:-'Not set'}"
echo "  PROJECT_ID: ${PROJECT_ID:-'Not set'}"
echo "  REGION: ${REGION:-'Not set'}"
echo "  DB_INSTANCE: ${DB_INSTANCE:-'Not set'}"
echo ""

# Check if we can connect using Cloud SQL proxy
if [[ -n "${PROJECT_ID:-}" && -n "${REGION:-}" && -n "${DB_INSTANCE:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  echo "✅ Cloud SQL proxy configuration available"
  echo "   Instance: $PROJECT_ID:$REGION:$DB_INSTANCE"
  echo "   Database: $DB_NAME"
  echo "   User: $DB_USER"
  echo ""

  # Check if cloud_sql_proxy is running
  if pgrep -f "cloud_sql_proxy" >/dev/null 2>&1; then
    echo "✅ Cloud SQL proxy appears to be running"
    echo "   Trying connection with proxy..."

    # Try to connect using proxy
    DATABASE_URL_ADMIN="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

    echo "   Testing connection..."
    if psql "$DATABASE_URL_ADMIN" -c "SELECT version();" >/dev/null 2>&1; then
      echo "✅ Connection successful!"
      echo ""
      echo "🎯 Solution: Set this environment variable:"
      echo "   export DATABASE_URL_ADMIN=\"$DATABASE_URL_ADMIN\""
      echo ""
      echo "Then run:"
      echo "   ./scripts/db_grant.sh"
      exit 0
    else
      echo "❌ Connection failed. Is Cloud SQL proxy running?"
      echo ""
      echo "🚀 To start Cloud SQL proxy:"
      echo "   cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
      echo ""
      echo "   Or use the automated deployment (recommended):"
      echo "   export AUTO_MIGRATE=true"
      echo "   export AUTO_GRANT_DB=true"
      echo "   ./scripts/gcp_deploy_ws.sh"
      exit 1
    fi
  else
    echo "❌ Cloud SQL proxy is not running"
    echo ""
    echo "🚀 Solutions:"
    echo ""
    echo "1. Start Cloud SQL proxy:"
    echo "   cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
    echo ""
    echo "2. Use automated deployment (recommended for private IP):"
    echo "   export AUTO_MIGRATE=true"
    echo "   export AUTO_GRANT_DB=true"
    echo "   ./scripts/gcp_deploy_ws.sh"
    echo ""
    echo "3. For public IP Cloud SQL, set:"
    echo "   export DB_ADMIN_USER=your_admin_user"
    echo "   export DB_ADMIN_PASSWORD=your_admin_password"
    echo "   export DB_HOST=your_public_ip"
  fi
else
  echo "❌ Missing required environment variables for Cloud SQL proxy"
  echo "   Required: PROJECT_ID, REGION, DB_INSTANCE, DB_USER, DB_PASSWORD, DB_NAME"
fi

echo ""
echo "📋 Summary:"
echo "• Private IP Cloud SQL cannot be accessed from local machine"
echo "• Use Cloud Run jobs for migrations (recommended)"
echo "• Or set up Cloud SQL proxy locally"
echo "• Or use public IP with admin credentials"
