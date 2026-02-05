#!/usr/bin/env bash
# Start web and ws locally (no Docker) with optional auto migrations.
# Usage: AUTO_MIGRATE=true ./scripts/start_local_nodocker.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Pick env file
if [[ -z "${ENV_FILE:-}" ]]; then
  if [[ -f ".env.local" ]]; then
    ENV_FILE=".env.local"
  else
    ENV_FILE=".env"
  fi
fi

echo "Loading environment from ${ENV_FILE}..."
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Copy .env.example to ${ENV_FILE} and configure it." >&2
  exit 1
fi

# Preserve CLI overrides
OVERRIDE_AUTO_MIGRATE="${AUTO_MIGRATE:-}"
OVERRIDE_SEED_GAMES="${SEED_GAMES:-}"
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

# Defaults
if [[ -n "${OVERRIDE_AUTO_MIGRATE}" ]]; then
  AUTO_MIGRATE="${OVERRIDE_AUTO_MIGRATE}"
else
  AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
fi
export AUTO_MIGRATE

if [[ -n "${OVERRIDE_SEED_GAMES}" ]]; then
  SEED_GAMES="${OVERRIDE_SEED_GAMES}"
  export SEED_GAMES
fi

# Ensure DATABASE_URL exists
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Please add it to ${ENV_FILE}." >&2
  exit 1
fi

# If DATABASE_URL points to host.docker.internal, rewrite to localhost for non-docker runs
LOCAL_DATABASE_URL="${DATABASE_URL/host.docker.internal/localhost}"
export DATABASE_URL="${LOCAL_DATABASE_URL}"

# Ensure Postgres exists by optionally launching a lightweight docker container if missing
DB_PORT="5432"
DB_CONTAINER="pokerwars-pg"

maybe_start_db() {
  if nc -z localhost "${DB_PORT}" >/dev/null 2>&1; then
    echo "Postgres already running on localhost:${DB_PORT}"
    return
  fi

  # Start or reuse named container
  if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "Starting existing Postgres container '${DB_CONTAINER}'..."
    docker start "${DB_CONTAINER}" >/dev/null
  else
    echo "No Postgres on localhost:${DB_PORT}; starting docker '${DB_CONTAINER}'..."
    docker run -d \
      --name "${DB_CONTAINER}" \
      -e POSTGRES_USER="${POSTGRES_USER:-postgres}" \
      -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}" \
      -e POSTGRES_DB="${POSTGRES_DB:-pokerwars}" \
      -p "${DB_PORT}:5432" \
      postgres:16 >/dev/null
  fi

  echo "Waiting for Postgres to become ready..."
  for i in $(seq 1 30); do
    if docker exec "${DB_CONTAINER}" pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-pokerwars}" >/dev/null 2>&1; then
      echo "Postgres is ready."
      return
    fi
    sleep 1
  done

  echo "ERROR: Postgres container did not become ready."
  exit 1
}

maybe_start_db

# Run migrations/seed on host DB
if [[ "${AUTO_MIGRATE}" == "true" ]]; then
  echo "Running database migrations (host) against ${DATABASE_URL} ..."
  ENV_FILE="${ENV_FILE}" DATABASE_URL="${DATABASE_URL}" ./scripts/db_bootstrap.sh
fi

# Optional seed for tournaments/games if requested
if [[ "${AUTO_SEED:-true}" == "true" ]]; then
  echo "Seeding database (tournaments, initial data, game templates)..."
  (cd apps/ws-server && npm run seed:all)
fi

echo "Starting ws-server (local) and web (local) without Docker..."
echo "Using DATABASE_URL=${DATABASE_URL}"

# Start both services in foreground with simple concurrency
npm run dev:ws &
WS_PID=$!
npm run dev:web &
WEB_PID=$!

trap 'echo "Stopping services..."; kill $WS_PID $WEB_PID >/dev/null 2>&1 || true' INT TERM EXIT

wait $WS_PID $WEB_PID
