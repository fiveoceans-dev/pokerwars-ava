#!/usr/bin/env bash
set -euo pipefail

echo "🗄️ Drop Database via psql"
echo "========================="

# Load environment
if [[ -f .env ]]; then
  set -a
  . .env
  set +a
else
  echo "❌ No .env file"
  exit 1
fi

# Check if Cloud SQL proxy is available
if ! command -v cloud_sql_proxy >/dev/null 2>&1; then
  echo "❌ Cloud SQL proxy not found"
  echo "Install from: https://cloud.google.com/sql/docs/mysql/sql-proxy"
  exit 1
fi

echo "Starting Cloud SQL proxy..."
cloud_sql_proxy -instances="$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432" &
PROXY_PID=$!
sleep 3

echo "Connecting to PostgreSQL..."
echo "Host: localhost:5432"
echo "Database: postgres (to drop $DB_NAME)"
echo "User: $DB_USER"
echo ""

# Try to connect and drop
PGPASSWORD="$DB_PASSWORD" psql -h localhost -p 5432 -U "$DB_USER" -d postgres << EOF
-- First disconnect any active connections to the database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();

-- Drop the database
DROP DATABASE IF EXISTS "$DB_NAME";
EOF

echo ""
echo "✅ Database dropped successfully"

# Clean up
kill $PROXY_PID 2>/dev/null || true

echo ""
echo "Now recreate the database:"
echo "gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE"
