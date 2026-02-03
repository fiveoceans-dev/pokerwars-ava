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

cd "$ROOT_DIR/apps/ws-server"

if [[ ! -d "prisma/migrations" ]]; then
  # No migrations checked in yet; create tables directly from schema.
  echo "No prisma migrations found; running prisma db push..."
  npx prisma db push --schema=prisma/schema.prisma
else
  # Standard production-safe path when migrations exist.
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy --schema=prisma/schema.prisma
fi

echo "Generating Prisma client..."
npx prisma generate --schema=prisma/schema.prisma

if [[ "${SEED_GAMES:-}" == "1" || "${SEED_GAMES:-}" == "true" ]]; then
  # Optional seed for game templates.
  echo "Seeding game templates..."
  npx ts-node ./scripts/seed-game-templates.ts
fi
