#!/bin/sh
set -e

# This script provides a robust, portable method for starting the local stack.
# It is idempotent: it can be run multiple times without error.

if [ -z "${ENV_FILE:-}" ]; then
  if [ -f ".env.local" ]; then
    ENV_FILE=".env.local"
  else
    ENV_FILE=".env"
  fi
fi

echo "Loading environment from ${ENV_FILE}..."
if [ ! -f "${ENV_FILE}" ]; then
    echo "ERROR: ${ENV_FILE} file not found. Please copy .env.example to ${ENV_FILE} and configure it."
    exit 1
fi

# Helper to extract a variable from .env without sourcing it (avoids shell syntax issues)
# and strips surrounding quotes.
get_env_var() {
    val=$(grep "^$1=" "${ENV_FILE}" | cut -d= -f2-)
    # Strip leading/trailing quotes (double or single)
    val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    echo "$val"
}

POSTGRES_USER=$(get_env_var POSTGRES_USER)
POSTGRES_PASSWORD=$(get_env_var POSTGRES_PASSWORD)
POSTGRES_DB=$(get_env_var POSTGRES_DB)
HYPERLIQUID_CHECK=$(get_env_var NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID)

# Defaults if missing
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-pokerwars}
CONTAINER_NAME="pokerwars-pg"

# Validation
if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "ERROR: POSTGRES_PASSWORD is empty. Please check your .env file."
    exit 1
fi

if [ -z "$HYPERLIQUID_CHECK" ]; then
    echo "WARNING: NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID is missing from .env."
    echo "Your .env file might be outdated. Please compare it with .env.example."
    echo "The web app may fail to initialize correctly without these variables."
    echo "Proceeding in 5 seconds..."
    sleep 5
fi

echo "Checking Postgres container status..."
# Check if container exists (running or stopped)
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # Check if it is currently running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Postgres container '${CONTAINER_NAME}' is already running."
    else
        echo "Starting existing stopped postgres container..."
        docker start "${CONTAINER_NAME}" > /dev/null
    fi
else
    echo "Creating and starting new postgres container..."
    # Explicitly pass the variables we extracted/defaulted to ensure the image gets them.
    docker run --name "${CONTAINER_NAME}" \
        -e POSTGRES_USER="${POSTGRES_USER}" \
        -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
        -e POSTGRES_DB="${POSTGRES_DB}" \
        -p "5432:5432" \
        -d postgres:16 > /dev/null
fi

echo "Waiting for Postgres to be ready..."
# Loop until the database is ready to accept connections
MAX_RETRIES=30
count=0
while [ $count -lt $MAX_RETRIES ]; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null 2>&1; then
        echo "Postgres is ready."
        break
    fi
    echo "Waiting for database... ($((count+1))/$MAX_RETRIES)"
    sleep 1
    count=$((count+1))
done

if [ $count -eq $MAX_RETRIES ]; then
    echo "ERROR: Postgres failed to start within the timeout period."
    echo "Printing container logs:"
    docker logs "${CONTAINER_NAME}" --tail 20
    exit 1
fi

# Export DATABASE_URL for the script's internal use (migrations) and for docker-compose substitution if needed
# We construct this manually to ensure it points to the host's docker gateway
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:5432/${POSTGRES_DB}?schema=public"

echo "Restarting web and ws-server containers..."
# Clean up old containers to ensure a fresh start
docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE}" down --remove-orphans

# Prepare a compose env file that ensures container DB points to host.docker.internal
COMPOSE_ENV_FILE="${ENV_FILE}"
TMP_ENV_FILE=""
if grep -q "^DATABASE_URL=" "${ENV_FILE}"; then
    raw_db_url=$(get_env_var DATABASE_URL)
    case "${raw_db_url}" in
        *localhost*|*127.0.0.1*)
            TMP_ENV_FILE="$(mktemp /tmp/pokerwars.env.XXXXXX)"
            awk -v repl="DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:5432/${POSTGRES_DB}?schema=public" '
                BEGIN { replaced=0 }
                /^DATABASE_URL=/ { print repl; replaced=1; next }
                { print }
                END { if (replaced==0) print repl }
            ' "${ENV_FILE}" > "${TMP_ENV_FILE}"
            COMPOSE_ENV_FILE="${TMP_ENV_FILE}"
            ;;
    esac
fi

# Start the stack with the build in the foreground so Ctrl+C stops everything.
# We use --env-file to ensure variables are loaded for runtime (poker-web).
# Build args in docker-compose.yml will be substituted from the shell environment
# which docker-compose AUTOMATICALLY loads from .env in the current directory.
cleanup() {
    echo ""
    echo "Stopping containers..."
    docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" down --remove-orphans
    if [ -n "${TMP_ENV_FILE}" ] && [ -f "${TMP_ENV_FILE}" ]; then
        rm -f "${TMP_ENV_FILE}"
    fi
}
trap cleanup INT TERM
docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" up --build

# Set the DATABASE_URL for the host-based migration script.
if [ "${AUTO_MIGRATE}" = "true" ]; then
    echo "Running database migrations on the host..."
    export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public"
    ./scripts/db_bootstrap.sh
fi
