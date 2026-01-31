#!/usr/bin/env bash
set -euo pipefail

echo "🔍 PokerWars Deployment Debug Script"
echo "===================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

echo "📁 Root directory: $ROOT_DIR"
echo "📄 Env file: $ENV_FILE"
echo ""

if [[ -f "$ENV_FILE" ]]; then
  echo "✅ Environment file exists"
else
  echo "❌ Environment file not found"
  exit 1
fi

# Load environment
set -a
. "$ENV_FILE"
set +a

echo ""
echo "🔧 Key Environment Variables:"
echo "  AUTO_MIGRATE: ${AUTO_MIGRATE:-'Not set'}"
echo "  AUTO_GRANT_DB: ${AUTO_GRANT_DB:-'Not set'}"
echo "  PROJECT_ID: ${PROJECT_ID:-'Not set'}"
echo "  REGION: ${REGION:-'Not set'}"
echo "  DB_INSTANCE: ${DB_INSTANCE:-'Not set'}"
echo "  DB_NAME: ${DB_NAME:-'Not set'}"
echo "  DB_USER: ${DB_USER:-'Not set'}"
echo ""

# Test the conditional logic from gcp_deploy_ws.sh
echo "🧪 Testing deployment logic:"

if [[ "${AUTO_MIGRATE:-}" == "1" || "${AUTO_MIGRATE:-}" == "true" ]]; then
  echo "✅ AUTO_MIGRATE condition would trigger migrations"
else
  echo "❌ AUTO_MIGRATE condition would NOT trigger migrations"
  echo "   Current value: '${AUTO_MIGRATE:-}'"
  echo "   Expected: '1' or 'true'"
fi

if [[ "${AUTO_GRANT_DB:-}" == "1" || "${AUTO_GRANT_DB:-}" == "true" ]]; then
  echo "✅ AUTO_GRANT_DB condition would run grants"
else
  echo "❌ AUTO_GRANT_DB condition would NOT run grants"
  echo "   Current value: '${AUTO_GRANT_DB:-}'"
fi

echo ""
echo "💡 Solutions:"
if [[ "${AUTO_MIGRATE:-}" != "1" && "${AUTO_MIGRATE:-}" != "true" ]]; then
  echo "1. Set AUTO_MIGRATE=true in your environment or command:"
  echo "   export AUTO_MIGRATE=true"
  echo "   ./scripts/gcp_deploy_ws.sh"
  echo ""
  echo "2. Or run migrations separately after deployment:"
  echo "   ./scripts/run_prisma_job.sh"
fi

if [[ "${AUTO_GRANT_DB:-}" != "1" && "${AUTO_GRANT_DB:-}" != "true" ]]; then
  echo "3. Set AUTO_GRANT_DB=true to enable automatic DB grants:"
  echo "   export AUTO_GRANT_DB=true"
fi

echo ""
echo "📋 Manual migration commands:"
echo "1. Run grants (if needed):"
echo "   export AUTO_GRANT_DB=true"
echo "   ./scripts/db_grant.sh"
echo ""
echo "2. Run migrations:"
echo "   ./scripts/run_prisma_job.sh"
echo ""
echo "3. Check migration status:"
echo "   gcloud run jobs executions list --job=pokerwars-prisma-migrate --region=\$REGION"
