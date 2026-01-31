#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Debug Migration Job Issues"
echo "============================="

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
echo "🗄️ Database Configuration:"
echo "  PROJECT_ID: ${PROJECT_ID:-}"
echo "  REGION: ${REGION:-us-central1}"
echo "  DB_INSTANCE: ${DB_INSTANCE:-}"
echo "  DB_NAME: ${DB_NAME:-}"
echo "  DB_USER: ${DB_USER:-}"
echo ""

echo "🔗 DATABASE_URL construction:"
if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  ENCODED_USER="$(echo -n "$DB_USER" | jq -sRr @uri 2>/dev/null || echo "$DB_USER")"
  ENCODED_PASS="$(echo -n "$DB_PASSWORD" | jq -sRr @uri 2>/dev/null || echo "$DB_PASSWORD")"
  DATABASE_URL="postgresql://${ENCODED_USER}:${ENCODED_PASS}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
  echo "  $DATABASE_URL"
else
  echo "  ❌ Missing required DB variables"
fi

echo ""
echo "📁 File Structure Check:"
if [[ -d "apps/ws-server/prisma" ]]; then
  echo "  ✅ apps/ws-server/prisma/ exists"

  if [[ -f "apps/ws-server/prisma/schema.prisma" ]]; then
    echo "  ✅ schema.prisma exists"
  else
    echo "  ❌ schema.prisma missing"
  fi

  if [[ -d "apps/ws-server/prisma/migrations" ]]; then
    migration_count=$(find apps/ws-server/prisma/migrations -name "*.sql" | wc -l)
    echo "  ✅ migrations/ exists with $migration_count SQL files"
  else
    echo "  ❌ migrations/ directory missing"
  fi
else
  echo "  ❌ apps/ws-server/prisma/ missing"
fi

echo ""
echo "🚀 Recent Cloud Run Job Executions:"
gcloud run jobs executions list --job=pokerwars-prisma-migrate --region="${REGION:-us-central1}" --limit=3 --format="table(name,status,startTime,duration)" 2>/dev/null || echo "  ❌ No executions found or access denied"

echo ""
echo "📋 Next Steps:"
echo "1. Check detailed logs:"
echo "   gcloud run jobs logs read --region=${REGION:-us-central1} --job=pokerwars-prisma-migrate"
echo ""
echo "2. The logs should show:"
echo "   - DATABASE_URL value"
echo "   - psql connection test results"
echo "   - Prisma migrate deploy output"
echo ""
echo "3. If DATABASE_URL is empty, check env file generation:"
echo "   ./scripts/build_cloudrun_env.sh"
echo "   cat .env.generated/env.prisma.env"
echo ""
echo "4. Test local Prisma connection (requires Cloud SQL proxy):"
echo "   cd apps/ws-server"
echo "   npx prisma migrate status --schema=prisma/schema.prisma"
