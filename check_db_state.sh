#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Database State Checker"
echo "========================="

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
echo "📊 Cloud SQL Database Status:"

# Check if database exists
echo "Checking database '$DB_NAME' in instance '$DB_INSTANCE'..."
if gcloud sql databases list --instance="$DB_INSTANCE" --project="$PROJECT_ID" --format="value(name)" | grep -q "^${DB_NAME}$"; then
  echo "✅ Database '$DB_NAME' exists"
else
  echo "❌ Database '$DB_NAME' does not exist"
  echo "   Create with: gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE"
  exit 1
fi

echo ""
echo "📋 Tables in database:"
# Try to list tables (this will fail without Cloud SQL proxy, but shows the command)
echo "Command to check tables:"
echo "gcloud sql databases execute $DB_INSTANCE --command=\"SELECT tablename FROM pg_tables WHERE schemaname='public';\""

echo ""
echo "🔧 Prisma Migration Status:"

# Check migration files
MIGRATION_DIR="apps/ws-server/prisma/migrations"
if [[ -d "$MIGRATION_DIR" ]]; then
  echo "✅ Migration directory exists"
  migration_count=$(find "$MIGRATION_DIR" -name "migration.sql" | wc -l)
  echo "   Found $migration_count migration files"

  echo ""
  echo "📄 Migration files:"
  find "$MIGRATION_DIR" -name "migration.sql" -exec basename {} \; | sort
else
  echo "❌ Migration directory not found"
fi

echo ""
echo "🗂️ Prisma Schema:"
SCHEMA_FILE="apps/ws-server/prisma/schema.prisma"
if [[ -f "$SCHEMA_FILE" ]]; then
  echo "✅ Schema file exists"

  # Count models in schema
  model_count=$(grep -c "^model " "$SCHEMA_FILE")
  echo "   Contains $model_count models"

  echo ""
  echo "📋 Models in schema:"
  grep "^model " "$SCHEMA_FILE" | sed 's/model //' | sed 's/ {.*//' | sort
else
  echo "❌ Schema file not found"
fi

echo ""
echo "🚀 Next Steps:"
echo "1. Check Cloud Run job logs:"
echo "   gcloud run jobs logs read --region=$REGION --job=pokerwars-prisma-migrate"
echo ""
echo "2. If logs show connection issues, check VPC connector:"
echo "   gcloud compute networks vpc-access connectors list --region=$REGION"
echo ""
echo "3. Test database connectivity (requires Cloud SQL proxy):"
echo "   cloud_sql_proxy -instances=$PROJECT_ID:$REGION:$DB_INSTANCE=tcp:5432"
echo "   Then: psql 'postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME' -c '\\dt'"
echo ""
echo "4. Manual migration test:"
echo "   cd apps/ws-server && npx prisma migrate status --schema=prisma/schema.prisma"
