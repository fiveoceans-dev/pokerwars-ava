#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
  echo "Loaded env from $ENV_FILE"
fi

: "${DATABASE_URL:?Missing DATABASE_URL}"

echo "Running prisma migrate deploy against DATABASE_URL"
cd "$ROOT_DIR/apps/ws-server"
npx prisma migrate deploy --schema=prisma/schema.prisma
