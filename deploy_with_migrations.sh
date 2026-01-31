#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Deploying PokerWars WS with Database Migrations"
echo "=================================================="

# Load environment
if [[ -f .env ]]; then
  set -a
  . .env
  set +a
  echo "✅ Loaded environment from .env"
else
  echo "❌ No .env file found"
  exit 1
fi

echo ""
echo "🔧 Setting migration flags:"
export AUTO_MIGRATE=true
export AUTO_GRANT_DB=true

echo "  AUTO_MIGRATE=true"
echo "  AUTO_GRANT_DB=true"
echo ""

echo "📦 Starting deployment..."
echo "This will:"
echo "1. Deploy the WS service to Cloud Run"
echo "2. Run database grants (if needed)"
echo "3. Create/run Prisma migration job"
echo ""

# Run the deployment
./scripts/gcp_deploy_ws.sh

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🔍 Check migration status:"
echo "  gcloud run jobs executions list --job=pokerwars-prisma-migrate --region=$REGION --limit=5"
echo ""
echo "📋 View migration logs:"
echo "  gcloud run jobs logs read --region=$REGION"
