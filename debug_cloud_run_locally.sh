#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Debug Cloud Run Job Locally"
echo "=============================="

echo "⚠️  This simulates what the Cloud Run job does inside the container"
echo "   Requires: Cloud SQL proxy running on localhost:5432"
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

# Check if proxy is running
if ! pgrep -f "cloud_sql_proxy" >/dev/null 2>&1; then
  echo "❌ Cloud SQL proxy not running"
  echo "   Start with: cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
  exit 1
fi

echo "✅ Cloud SQL proxy detected"

# Simulate the DATABASE_URL from the env file
TEST_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
export DATABASE_URL="$TEST_DATABASE_URL"

echo ""
echo "🔗 Using DATABASE_URL: $DATABASE_URL"

echo ""
echo "=== DB DEBUG ==="
echo "DATABASE_URL: $DATABASE_URL"

echo ""
echo "Testing connection..."
if psql "$DATABASE_URL" -c "SELECT current_user, session_user;" 2>/dev/null; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  exit 1
fi

echo ""
echo "Testing schema access..."
if psql "$DATABASE_URL" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name='public';" 2>/dev/null; then
  echo "✅ Schema access successful"
else
  echo "❌ Schema access failed"
fi

echo ""
echo "=== PRISMA SYNC ==="

# Simulate the simplified Cloud Run command
echo "Simulating Cloud Run command:"
echo "cd apps/ws-server && npx prisma migrate deploy --schema=prisma/schema.prisma && npx prisma generate"

# Change to the app directory (simulating container)
if [[ -d "apps/ws-server" ]]; then
  cd apps/ws-server
  echo "✅ Changed to apps/ws-server directory"
  echo "Current directory: $(pwd)"

  # Check if schema exists
  if [[ -f "prisma/schema.prisma" ]]; then
    echo "✅ Found prisma/schema.prisma"

    echo ""
    echo "Running: npx prisma db push --schema=prisma/schema.prisma --accept-data-loss"
    if npx prisma db push --schema=prisma/schema.prisma --accept-data-loss 2>&1; then
      echo "✅ DB push completed"
    else
      echo "❌ Migration deploy failed, trying db push..."
      npx prisma db push --schema=prisma/schema.prisma --accept-data-loss 2>&1 || {
        echo "❌ Both migrate deploy and db push failed"
        exit 1
      }
    fi

    echo ""
    echo "Running: npx prisma generate"
    npx prisma generate 2>&1

  else
    echo "❌ prisma/schema.prisma not found"
    exit 1
  fi
else
  echo "❌ apps/ws-server directory not found"
  exit 1
fi

echo ""
echo "=== DONE ==="
echo "Checking final table count..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "Could not check table count"
