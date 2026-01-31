#!/usr/bin/env bash
set -euo pipefail

echo "🔄 Database Reset Script"
echo "========================"

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
echo "🗄️ Database: $DB_NAME on instance $DB_INSTANCE"
echo "👤 User: $DB_USER"
echo ""

echo "Step 1: Connect to database and drop it..."
echo "=========================================="

# Use Cloud SQL proxy to connect and drop the database
if command -v cloud_sql_proxy >/dev/null 2>&1; then
  echo "✅ Cloud SQL proxy available"

  # Start proxy in background
  echo "Starting Cloud SQL proxy..."
  cloud_sql_proxy -instances="$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432" &
  PROXY_PID=$!
  sleep 3

  # Try to drop database using admin user
  echo "Attempting to drop database as $DB_USER..."
  if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p 5432 -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>/dev/null; then
    echo "✅ Database dropped successfully"
  else
    echo "❌ Failed to drop as $DB_USER"
    echo ""
    echo "🔧 Alternative: Use gcloud to connect as superuser"
    echo "gcloud sql connect $DB_INSTANCE --user=postgres"
    echo "Then run: DROP DATABASE \"$DB_NAME\";"
    echo ""
    kill $PROXY_PID 2>/dev/null || true
    exit 1
  fi

  kill $PROXY_PID 2>/dev/null || true

else
  echo "❌ Cloud SQL proxy not installed"
  echo ""
  echo "Install from: https://cloud.google.com/sql/docs/mysql/sql-proxy"
  echo ""
  echo "Or use gcloud sql connect:"
  echo "gcloud sql connect $DB_INSTANCE --user=postgres"
  exit 1
fi

echo ""
echo "Step 2: Recreate database..."
echo "============================"

# Recreate database using gcloud
echo "Creating new database..."
gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE"

echo ""
echo "Step 3: Grant permissions..."
echo "============================"

# Run the grant script
echo "Setting up user permissions..."
./scripts/db_grant.sh

echo ""
echo "Step 4: Run migrations..."
echo "========================="

# Run the migration job
echo "Running Prisma migrations..."
./scripts/run_prisma_job.sh

echo ""
echo "✅ Database reset complete!"
echo ""
echo "🔍 Verify tables were created:"
echo "gcloud sql databases execute $DB_INSTANCE --command=\"SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';\""
