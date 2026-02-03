#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Deploying PokerWars with Database Seeding"
echo "==========================================="

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
echo "🔧 Setting deployment flags:"
export CREATE_CLOUDSQL=true
export AUTO_GRANT_DB=true
export AUTO_MIGRATE=true
export AUTO_SEED=true

echo "  CREATE_CLOUDSQL=true"
echo "  AUTO_GRANT_DB=true"
echo "  AUTO_MIGRATE=true"
echo "  AUTO_SEED=true"
echo ""

echo "📦 Starting full deployment with seeding..."
echo "This will:"
echo "1. Create Cloud SQL database (if needed)"
echo "2. Grant database permissions"
echo "3. Run database migrations (create tables)"
echo "4. Seed initial data (treasury, ledger, templates)"
echo "5. Deploy WebSocket server"
echo ""

# Run the deployment
./scripts/gcp_deploy_ws.sh

echo ""
echo "✅ Full deployment with seeding completed!"
echo ""
echo "🔍 Verify seeded data:"
echo "gcloud sql databases execute pokerwars-instance --command=\"SELECT id, coin_supply_total FROM \\\"Treasury\\\";\""
echo ""
echo "gcloud sql databases execute pokerwars-instance --command=\"SELECT COUNT(*) FROM \\\"GameTemplate\\\";\""
echo ""
echo "📊 Expected results:"
echo "  • Treasury: 1 record with 5,000,000,000 coins"
echo "  • Game Templates: 6+ templates (cash + tournaments)"
echo "  • Ledger: Genesis block and transaction"
echo "  • Blind Schedules: STT and MTT schedules"
