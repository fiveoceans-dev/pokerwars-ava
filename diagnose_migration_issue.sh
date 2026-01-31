#!/usr/bin/env bash
set -euo pipefail

echo "🔬 Complete Migration Issue Diagnosis"
echo "===================================="

# Load environment
if [[ -f .env ]]; then
  set -a
  . .env
  set +a
  echo "✅ Loaded .env"
else
  echo "❌ No .env file found"
  exit 1
fi

echo ""
echo "1️⃣  ENVIRONMENT CHECK"
echo "===================="
echo "PROJECT_ID: ${PROJECT_ID:-}"
echo "REGION: ${REGION:-us-central1}"
echo "DB_INSTANCE: ${DB_INSTANCE:-}"
echo "DB_NAME: ${DB_NAME:-}"
echo "DB_USER: ${DB_USER:-}"
echo "AUTO_MIGRATE: ${AUTO_MIGRATE:-}"
echo "AUTO_GRANT_DB: ${AUTO_GRANT_DB:-}"

echo ""
echo "2️⃣  DATABASE CHECK"
echo "=================="
if gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" --format="value(state)" >/dev/null 2>&1; then
  echo "✅ Cloud SQL instance '$DB_INSTANCE' exists"
else
  echo "❌ Cloud SQL instance '$DB_INSTANCE' not found"
fi

if gcloud sql databases list --instance="$DB_INSTANCE" --project="$PROJECT_ID" --format="value(name)" | grep -q "^${DB_NAME}$"; then
  echo "✅ Database '$DB_NAME' exists"
else
  echo "❌ Database '$DB_NAME' not found"
fi

echo ""
echo "3️⃣  MIGRATION FILES CHECK"
echo "========================="
MIGRATION_DIR="apps/ws-server/prisma/migrations"
if [[ -d "$MIGRATION_DIR" ]]; then
  echo "✅ Migration directory exists"
  migration_count=$(find "$MIGRATION_DIR" -name "migration.sql" | wc -l)
  echo "   Found $migration_count migration files:"
  find "$MIGRATION_DIR" -name "migration.sql" -exec basename {} \; | sed 's/migration.sql//' | sort | sed 's/^/     /'
else
  echo "❌ Migration directory not found"
fi

echo ""
echo "4️⃣  SCHEMA CHECK"
echo "================"
SCHEMA_FILE="apps/ws-server/prisma/schema.prisma"
if [[ -f "$SCHEMA_FILE" ]]; then
  echo "✅ Schema file exists"
  model_count=$(grep -c "^model " "$SCHEMA_FILE")
  echo "   Contains $model_count models"
else
  echo "❌ Schema file not found"
fi

echo ""
echo "5️⃣  CLOUD RUN JOB CHECK"
echo "======================="
JOB_NAME="pokerwars-prisma-migrate"
if gcloud run jobs describe "$JOB_NAME" --region="${REGION:-us-central1}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "✅ Cloud Run job '$JOB_NAME' exists"

  echo ""
  echo "Recent executions:"
  gcloud run jobs executions list --job="$JOB_NAME" --region="${REGION:-us-central1}" --project="$PROJECT_ID" --limit=3 --format="table(name,status,startTime,duration)" 2>/dev/null || echo "   No executions found"
else
  echo "❌ Cloud Run job '$JOB_NAME' not found"
fi

echo ""
echo "6️⃣  RECOMMENDED FIXES"
echo "====================="
echo "A. Check detailed Cloud Run job logs:"
echo "   gcloud run jobs logs read --region=${REGION:-us-central1} --job=$JOB_NAME"
echo ""
echo "B. If logs show 'no migrations to apply', the database might already have tables:"
echo "   gcloud sql databases execute $DB_INSTANCE --command=\"SELECT tablename FROM pg_tables WHERE schemaname='public';\""
echo ""
echo "C. Try manual migration with fallback:"
echo "   ./scripts/run_prisma_job.sh"
echo ""
echo "D. Test locally (requires Cloud SQL proxy):"
echo "   cloud_sql_proxy -instances=$PROJECT_ID:${REGION:-us-central1}:$DB_INSTANCE=tcp:5432"
echo "   ./test_migration_locally.sh"
echo ""
echo "E. Force recreate job (if configuration changed):"
echo "   gcloud run jobs delete $JOB_NAME --region=${REGION:-us-central1}"
echo "   ./scripts/run_prisma_job.sh"
echo ""
echo "F. Check if VPC connector is needed:"
echo "   gcloud compute networks vpc-access connectors list --region=${REGION:-us-central1}"
