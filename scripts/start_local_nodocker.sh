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

# Synchronize environment variables to workspaces
echo "Synchronizing environment variables..."
ENV_FILE="${ENV_FILE}" ./scripts/sync_env.sh

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

# Helper to extract a variable from .env without sourcing it (avoids shell syntax issues)
get_env_var() {
    val=$(grep "^$1=" "${ENV_FILE}" | cut -d= -f2-)
    # Strip leading/trailing quotes (double or single)
    val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    echo "$val"
}

POSTGRES_USER="${POSTGRES_USER:-$(get_env_var POSTGRES_USER)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(get_env_var POSTGRES_PASSWORD)}"
POSTGRES_DB="${POSTGRES_DB:-$(get_env_var POSTGRES_DB)}"
POSTGRES_PORT_ENV="${POSTGRES_PORT:-$(get_env_var POSTGRES_PORT)}"
DATABASE_URL_ENV="${DATABASE_URL:-$(get_env_var DATABASE_URL)}"

if [[ -z "${POSTGRES_PORT_ENV}" && -n "${DATABASE_URL_ENV}" ]]; then
  if [[ "${DATABASE_URL_ENV}" =~ @[^:/?#]+:([0-9]+) ]]; then
    POSTGRES_PORT_ENV="${BASH_REMATCH[1]}"
  fi
fi

# Defaults if missing
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-pokerwars}
DB_CONTAINER="pokerwars-pg"

# Dynamic Port Discovery for Local Dev
if [ -n "$POSTGRES_PORT_ENV" ]; then
    DB_PORT=$POSTGRES_PORT_ENV
    echo "Using explicitly configured POSTGRES_PORT: $DB_PORT"
else
    # Find first available port starting from 5432
    SEARCH_PORT=5432
    MAX_PORT=5440
    FOUND_PORT=""
    
    echo "Searching for an available Postgres port..."
    while [ $SEARCH_PORT -le $MAX_PORT ]; do
        if ! nc -z localhost $SEARCH_PORT > /dev/null 2>&1; then
            FOUND_PORT=$SEARCH_PORT
            break
        fi
        SEARCH_PORT=$((SEARCH_PORT + 1))
    done

    if [ -z "$FOUND_PORT" ]; then
        echo "ERROR: No available ports found in range 5432-$MAX_PORT."
        exit 1
    fi
    DB_PORT=$FOUND_PORT
    echo "Selected available port: $DB_PORT"
fi

maybe_start_db() {
  # Check if container exists
  if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    EXISTING_PORT=$(docker inspect "${DB_CONTAINER}" --format='{{(index (index .HostConfig.PortBindings "5432/tcp") 0).HostPort}}' 2>/dev/null || echo "unknown")
    
    if [ "$EXISTING_PORT" != "$DB_PORT" ]; then
        echo "Port mismatch detected: existing container uses $EXISTING_PORT, but we need $DB_PORT."
        docker stop "${DB_CONTAINER}" >/dev/null 2>&1 || true
        docker rm "${DB_CONTAINER}" >/dev/null 2>&1 || true
        
        echo "Creating new postgres container on port $DB_PORT..."
        docker run -d \
          --name "${DB_CONTAINER}" \
          -e POSTGRES_USER="${POSTGRES_USER}" \
          -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
          -e POSTGRES_DB="${POSTGRES_DB}" \
          -p "${DB_PORT}:5432" \
          postgres:16 >/dev/null
    elif docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
        echo "Postgres container '${DB_CONTAINER}' is already running on port $DB_PORT."
    else
        echo "Starting existing stopped postgres container on port $DB_PORT..."
        docker start "${DB_CONTAINER}" >/dev/null
    fi
  else
    echo "Creating new postgres container on port $DB_PORT..."
    docker run -d \
      --name "${DB_CONTAINER}" \
      -e POSTGRES_USER="${POSTGRES_USER}" \
      -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
      -e POSTGRES_DB="${POSTGRES_DB}" \
      -p "${DB_PORT}:5432" \
      postgres:16 >/dev/null
  fi

  echo "Waiting for Postgres to become ready..."
  for i in $(seq 1 30); do
    if docker exec "${DB_CONTAINER}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      echo "Postgres is ready."
      return
    fi
    sleep 1
  done

  echo "ERROR: Postgres container did not become ready."
  exit 1
}

maybe_start_db

# Construct DATABASE_URL using the discovered port
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${DB_PORT}/${POSTGRES_DB}?schema=public"

# Keep workspace ws-server env in sync with the runtime URL so local scripts and
# direct app runs resolve the same database endpoint.
WS_ENV_FILE="$ROOT_DIR/apps/ws-server/.env"
if [[ -f "$WS_ENV_FILE" ]]; then
  WS_ENV_TMP="${WS_ENV_FILE}.tmp"
  grep -v '^DATABASE_URL=' "$WS_ENV_FILE" > "$WS_ENV_TMP" || true
  echo "DATABASE_URL=$DATABASE_URL" >> "$WS_ENV_TMP"
  mv "$WS_ENV_TMP" "$WS_ENV_FILE"
else
  echo "DATABASE_URL=$DATABASE_URL" > "$WS_ENV_FILE"
fi

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
