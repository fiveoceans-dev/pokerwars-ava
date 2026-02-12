#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -z "${DATABASE_URL:-}" && -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
  echo "Loaded env from $ENV_FILE"
fi

: "${DATABASE_URL:?Missing DATABASE_URL}"

# Mask password for display
MASKED_URL=$(echo "$DATABASE_URL" | sed 's/:[^/@]*@/:****@/')
echo "Targeting database: $MASKED_URL"

cd "$ROOT_DIR/apps/ws-server"

# Check for schema changes and create a new migration automatically if needed.
# This makes `start_local.sh` non-interactive for migration creation.
# It uses a timestamped name for the new migration.
if npx prisma migrate diff --from-schema-datasource=prisma/schema.prisma --to-schema-datasource=prisma/schema.prisma --exit-code; then
  echo "No schema changes detected, skipping migration creation."
else
  echo "Schema changes detected. Creating new migration non-interactively..."
  npx prisma migrate dev --create-only --name "auto-migration-$(date +%Y%m%d%H%M%S)" --skip-generate --schema=prisma/schema.prisma
fi

# Now apply all pending migrations. This is idempotent.
echo "Running prisma migrate deploy..."
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "Generating Prisma client..."
npx prisma generate --schema=prisma/schema.prisma

if [[ "${SEED_GAMES:-}" == "1" || "${SEED_GAMES:-}" == "true" ]]; then
  # Optional seed for game templates.
  echo "Seeding game templates..."
  npx ts-node ./scripts/seed-game-templates.ts
fi
