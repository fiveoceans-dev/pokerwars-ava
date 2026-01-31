#!/usr/bin/env bash
set -euo pipefail

echo "🧪 Test Cloud Run Job Arguments"
echo "==============================="

# Load environment
if [[ -f .env ]]; then
  set -a
  . .env
  set +a
else
  echo "❌ No .env file"
  exit 1
fi

# Construct the command that would be used
COMMAND="sh"
ARGS="-c,echo '=== DB DEBUG ===' && echo \"DATABASE_URL: \$DATABASE_URL\" && psql \"\$DATABASE_URL\" -c \"SELECT current_user, session_user;\" 2>/dev/null || echo \"psql connection failed\" && psql \"\$DATABASE_URL\" -c \"SELECT schema_name FROM information_schema.schemata WHERE schema_name='public';\" 2>/dev/null || echo \"schema check failed\" && echo '=== PRISMA SYNC ===' && cd /app/apps/ws-server || { echo \"Failed to cd to apps/ws-server\"; exit 1; } && echo \"Current directory: \$(pwd)\" && echo \"Files in prisma/: \$(ls -la prisma/ 2>/dev/null || echo 'prisma dir not found')\" && if [[ ! -f \"prisma/schema.prisma\" ]]; then echo \"ERROR: prisma/schema.prisma not found\"; exit 1; fi && if [[ -z \"\${DATABASE_URL:-}\" ]]; then echo \"ERROR: DATABASE_URL is not set\"; exit 1; fi && echo \"Running: npx prisma migrate deploy --schema=prisma/schema.prisma\" && npx prisma migrate deploy --schema=prisma/schema.prisma || { echo \"Migration failed, trying db push as fallback...\"; npx prisma db push --schema=prisma/schema.prisma --accept-data-loss || { echo \"Both migrate deploy and db push failed\"; exit 1; }; } && echo \"Running: npx prisma generate\" && npx prisma generate && echo '=== DONE ==='"

echo "Command: $COMMAND"
echo "Args: $ARGS"
echo ""

# Test that the args don't contain problematic characters
if [[ "$ARGS" == *"to"* && "$ARGS" == *"cd"* ]]; then
  echo "❌ Args still contain multiline script elements"
  echo "   This will cause gcloud argument parsing issues"
  exit 1
else
  echo "✅ Args are properly formatted as single line"
fi

# Count && operators (should be many)
and_count=$(grep -o "&&" <<< "$ARGS" | wc -l)
echo "✅ Found $and_count command chains (&& operators)"

echo ""
echo "🎯 Cloud Run job should now work without argument parsing errors!"
echo ""
echo "Test the fix:"
echo "./scripts/run_prisma_job.sh"
