#!/usr/bin/env bash
set -euo pipefail

echo "🧪 Test Prisma Migration Locally"
echo "==============================="

echo "⚠️ This script requires:"
echo "   1. Cloud SQL proxy running on localhost:5432"
echo "   2. Valid DATABASE_URL"
echo ""

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
echo "🔧 Setting up test environment..."

# Check if Cloud SQL proxy is running
if pgrep -f "cloud_sql_proxy" >/dev/null 2>&1; then
  echo "✅ Cloud SQL proxy appears to be running"
else
  echo "❌ Cloud SQL proxy not running"
  echo "   Start with: cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
  echo ""
  echo "   Or run this test in the Cloud Run environment"
  exit 1
fi

# Construct test DATABASE_URL
TEST_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

echo ""
echo "🧪 Testing database connection..."
if psql "$TEST_DATABASE_URL" -c "SELECT version();" >/dev/null 2>&1; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  exit 1
fi

echo ""
echo "📁 Changing to ws-server directory..."
cd apps/ws-server

echo ""
echo "🔍 Checking Prisma setup..."
echo "Current directory: $(pwd)"
echo "Schema exists: $([[ -f prisma/schema.prisma ]] && echo '✅' || echo '❌')"

echo ""
echo "📊 Current migration status:"
export DATABASE_URL="$TEST_DATABASE_URL"
npx prisma migrate status --schema=prisma/schema.prisma

echo ""
echo "🗃️ Current tables in database:"
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

echo ""
echo "🚀 Testing migration deployment..."
echo "Command: npx prisma migrate deploy --schema=prisma/schema.prisma"
if npx prisma migrate deploy --schema=prisma/schema.prisma; then
  echo "✅ Migration deploy successful"
else
  echo "❌ Migration deploy failed"
  echo ""
  echo "💡 Trying db push as alternative..."
  npx prisma db push --schema=prisma/schema.prisma --accept-data-loss
fi

echo ""
echo "📋 Final table count:"
psql "$DATABASE_URL" -c "SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname='public';"
