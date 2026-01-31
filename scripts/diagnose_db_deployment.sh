#!/usr/bin/env bash
set -euo pipefail

echo "🔍 PokerWars Database Deployment Diagnostics"
echo "============================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

# Load environment
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

# Check required variables
echo "🔧 Checking required database variables:"
required_vars=(PROJECT_ID REGION DB_INSTANCE DB_NAME DB_USER)
missing_vars=()

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ $var: MISSING"
    missing_vars+=("$var")
  else
    echo "✅ $var: SET"
  fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo ""
  echo "❌ Missing required environment variables:"
  printf '  - %s\n' "${missing_vars[@]}"
  exit 1
fi

echo ""
echo "✅ All required variables are set."

# Check Cloud SQL instance
echo ""
echo "🗄️ Checking Cloud SQL instance:"
if gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" --format="value(state)" >/dev/null 2>&1; then
  echo "✅ Cloud SQL instance '$DB_INSTANCE' exists"

  # Check database exists
  if gcloud sql databases list --instance="$DB_INSTANCE" --project="$PROJECT_ID" --format="value(name)" | grep -q "^${DB_NAME}$"; then
    echo "✅ Database '$DB_NAME' exists in instance '$DB_INSTANCE'"
  else
    echo "❌ Database '$DB_NAME' not found in instance '$DB_INSTANCE'"
    echo "   Create with: gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE"
  fi
else
  echo "❌ Cloud SQL instance '$DB_INSTANCE' not found"
  echo "   Create with: gcloud sql instances create $DB_INSTANCE --database-version=POSTGRES_15 --tier=db-g1-small --region=$REGION"
fi

# Check migration files
echo ""
echo "📁 Checking migration files:"
MIGRATION_DIR="$ROOT_DIR/apps/ws-server/prisma/migrations"

if [[ -d "$MIGRATION_DIR" ]]; then
  migration_count=$(find "$MIGRATION_DIR" -name "migration.sql" | wc -l | tr -d ' ')
  echo "✅ Found $migration_count migration files"

  # Check if main migration has content
  main_migration="$MIGRATION_DIR/20260131132529_init/migration.sql"
  if [[ -f "$main_migration" ]]; then
    line_count=$(wc -l < "$main_migration")
    echo "✅ Main migration file has $line_count lines (should be > 200 for table creation)"
  else
    echo "❌ Main migration file not found"
  fi
else
  echo "❌ Migration directory not found at $MIGRATION_DIR"
fi

# Check deployment script
echo ""
echo "🔨 Checking deployment script:"
PRISMA_JOB_SCRIPT="$ROOT_DIR/scripts/run_prisma_job.sh"

if grep -q "migrate deploy" "$PRISMA_JOB_SCRIPT"; then
  echo "✅ Deployment script uses 'prisma migrate deploy' (correct)"
else
  echo "❌ Deployment script still uses 'prisma db push' (incorrect)"
  echo "   Fix: Update run_prisma_job.sh to use 'npx prisma migrate deploy'"
fi

# Check Cloud Run job status
echo ""
echo "🚀 Checking Cloud Run job status:"
JOB_NAME="${JOB_NAME:-pokerwars-prisma-migrate}"

if gcloud run jobs describe "$JOB_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "✅ Cloud Run job '$JOB_NAME' exists"

  # Check recent executions
  echo "Recent job executions:"
  gcloud run jobs executions list --job="$JOB_NAME" --region="$REGION" --project="$PROJECT_ID" --limit=3 --format="table(name,status,startTime,duration)" 2>/dev/null || echo "   No recent executions found"
else
  echo "❌ Cloud Run job '$JOB_NAME' not found"
fi

echo ""
echo "📋 Next Steps:"
echo "1. If database doesn't exist: Create it first"
echo "2. Set AUTO_MIGRATE=true and redeploy:"
echo "   AUTO_MIGRATE=true ./scripts/gcp_deploy_ws.sh"
echo ""
echo "3. Check job logs if migration fails:"
echo "   gcloud run jobs logs read --region=$REGION"
echo ""
echo "4. Manual migration (if needed):"
echo "   ./scripts/run_prisma_job.sh"
