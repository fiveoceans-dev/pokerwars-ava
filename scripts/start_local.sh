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

# Synchronize environment variables to workspaces
echo "Synchronizing environment variables..."
ENV_FILE="${ENV_FILE}" ./scripts/sync_env.sh

# Export variables from the env file so docker-compose build args are populated.
# Preserve explicit CLI overrides (e.g., AUTO_MIGRATE=true ./scripts/start_local.sh).
OVERRIDE_AUTO_MIGRATE="${AUTO_MIGRATE:-}"
OVERRIDE_AUTO_SEED="${AUTO_SEED:-}"
OVERRIDE_SEED_GAMES="${SEED_GAMES:-}"
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a
if [ -n "${OVERRIDE_AUTO_MIGRATE}" ]; then
    AUTO_MIGRATE="${OVERRIDE_AUTO_MIGRATE}"
else
    AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
fi
export AUTO_MIGRATE
if [ -n "${OVERRIDE_AUTO_SEED}" ]; then
    AUTO_SEED="${OVERRIDE_AUTO_SEED}"
else
    AUTO_SEED="${AUTO_SEED:-true}"
fi
export AUTO_SEED
FORCE_SEED_TOURNAMENTS="${FORCE_SEED_TOURNAMENTS:-true}"
export FORCE_SEED_TOURNAMENTS
if [ -n "${OVERRIDE_SEED_GAMES}" ]; then
    SEED_GAMES="${OVERRIDE_SEED_GAMES}"
    export SEED_GAMES
fi

# Helper to extract a variable from .env without sourcing it (avoids shell syntax issues)
# and strips surrounding quotes.
get_env_var() {
    val=$(grep "^$1=" "${ENV_FILE}" | cut -d= -f2-)
    # Strip leading/trailing quotes (double or single)
    val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    echo "$val"
}

strip_quotes() {
    echo "$1" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

POSTGRES_USER="${POSTGRES_USER:-$(get_env_var POSTGRES_USER)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(get_env_var POSTGRES_PASSWORD)}"
POSTGRES_DB="${POSTGRES_DB:-$(get_env_var POSTGRES_DB)}"
POSTGRES_PORT_ENV="${POSTGRES_PORT:-$(get_env_var POSTGRES_PORT)}"
HYPERLIQUID_CHECK=$(get_env_var NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID)

# Defaults if missing
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-pokerwars}
CONTAINER_NAME="pokerwars-pg"

# Dynamic Port Discovery for Local Dev
if [ -n "$POSTGRES_PORT_ENV" ]; then
    POSTGRES_PORT=$POSTGRES_PORT_ENV
    echo "Using explicitly configured POSTGRES_PORT: $POSTGRES_PORT"
else
    # Find first available port starting from 5432
    SEARCH_PORT=5432
    MAX_PORT=5440
    FOUND_PORT=""
    
    echo "Searching for an available Postgres port..."
    while [ $SEARCH_PORT -le $MAX_PORT ]; do
        # Use nc -z to check if port is open (busy)
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
    POSTGRES_PORT=$FOUND_PORT
    echo "Selected available port: $POSTGRES_PORT"
fi

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
    # Check if the existing container is using the correct port mapping
    # Note: we check the host port mapped to the internal 5432/tcp
    EXISTING_PORT=$(docker inspect "${CONTAINER_NAME}" --format='{{(index (index .HostConfig.PortBindings "5432/tcp") 0).HostPort}}' 2>/dev/null || echo "unknown")
    
    if [ "$EXISTING_PORT" != "$POSTGRES_PORT" ]; then
        echo "Port mismatch detected: existing container uses $EXISTING_PORT, but we need $POSTGRES_PORT."
        echo "Removing old container to update port mapping..."
        docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        
        echo "Creating and starting new postgres container on port $POSTGRES_PORT..."
        docker run --name "${CONTAINER_NAME}" \
            -e POSTGRES_USER="${POSTGRES_USER}" \
            -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
            -e POSTGRES_DB="${POSTGRES_DB}" \
            -p "${POSTGRES_PORT}:5432" \
            -d postgres:16 > /dev/null
    elif docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Postgres container '${CONTAINER_NAME}' is already running on port $POSTGRES_PORT."
    else
        echo "Starting existing stopped postgres container on port $POSTGRES_PORT..."
        docker start "${CONTAINER_NAME}" > /dev/null
    fi
else
    echo "Creating and starting new postgres container on port $POSTGRES_PORT..."
    # Map the dynamic host port to the standard internal 5432
    docker run --name "${CONTAINER_NAME}" \
        -e POSTGRES_USER="${POSTGRES_USER}" \
        -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
        -e POSTGRES_DB="${POSTGRES_DB}" \
        -p "${POSTGRES_PORT}:5432" \
        -d postgres:16 > /dev/null
fi

echo "Waiting for Postgres to be ready..."
# Loop until the database is ready to accept connections
MAX_RETRIES=30
count=0
while [ $count -lt $MAX_RETRIES ]; do
    # Note: we check readiness via the mapped host port
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
# We construct this manually to ensure it points to the host's docker gateway via the dynamic port
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"

echo "Restarting web and ws-server containers..."
# Clean up old containers to ensure a fresh start
docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE}" down --remove-orphans

COMPOSE_ENV_FILE="${ENV_FILE}"
TEMP_ENV_FILE=""
COMPOSE_BUILD_OPTS=()
if [ "${NO_CACHE:-}" = "true" ] || [ "${COMPOSE_NO_CACHE:-}" = "true" ]; then
    COMPOSE_BUILD_OPTS+=(--no-cache)
fi
COMPOSE_BUILD_RUN=0
export ENV_FILE="${ENV_FILE}"
if grep -q "^DATABASE_URL=" "${ENV_FILE}"; then
    raw_db_url=$(get_env_var DATABASE_URL)
    raw_db_url=$(strip_quotes "${raw_db_url}")
    case "${raw_db_url}" in
        postgresql://*|postgres://*)
            if echo "${raw_db_url}" | grep -qE 'localhost|127\.0\.0\.1'; then
                echo "Detected ${ENV_FILE} DATABASE_URL using localhost; creating a docker env file that replaces it with host.docker.internal for container runtime."
                docker_db_url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
                TEMP_ENV_FILE=$(mktemp /tmp/pokerwars-compose-env.XXXXXX)
                {
                    grep -v '^DATABASE_URL=' "${ENV_FILE}"
                    echo "DATABASE_URL=${docker_db_url}"
                } > "${TEMP_ENV_FILE}"
                COMPOSE_ENV_FILE="${TEMP_ENV_FILE}"
                ENV_FILE="${COMPOSE_ENV_FILE}"
                echo "Docker compose will read ${COMPOSE_ENV_FILE} with ${docker_db_url}."
            fi
            ;;
        *)
            echo "ERROR: DATABASE_URL must start with postgresql:// or postgres:// in ${ENV_FILE}" >&2
            exit 1
            ;;
    esac
else
    echo "ERROR: DATABASE_URL missing in ${ENV_FILE}" >&2
    exit 1
fi

# Run migrations before starting services (host connects to Postgres on localhost:PORT).
if [ "${AUTO_MIGRATE}" = "true" ]; then
    echo "Running database migrations on the host using port $POSTGRES_PORT..."
    export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
    ./scripts/db_bootstrap.sh
    echo "Generating Prisma client for latest schema..."
    npm run db:generate
    if [ "${AUTO_SEED}" = "true" ]; then
        echo "Seeding database (idempotent)..."
        npm run seed:all -w apps/ws-server
    fi
fi

# Start the stack with the build in the foreground so Ctrl+C stops everything.
# We use --env-file to ensure variables are loaded for runtime (poker-web).
# Build args in docker-compose.yml will be substituted from the shell environment
# which docker-compose AUTOMATICALLY loads from .env in the current directory.
cleanup() {
    if [ "${CLEANED_UP:-}" = "1" ]; then
        return
    fi
    CLEANED_UP=1
    echo ""
    echo "Stopping containers..."
    docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" down --remove-orphans
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Stopping Postgres container..."
        docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi
    if [ -n "${TEMP_ENV_FILE}" ] && [ "${TEMP_ENV_FILE}" != "${ENV_FILE}" ]; then
        rm -f "${TEMP_ENV_FILE}"
    fi
}
trap cleanup EXIT INT TERM
if [ "${#COMPOSE_BUILD_OPTS[@]}" -gt 0 ]; then
    echo "Building images with compose (options: ${COMPOSE_BUILD_OPTS[*]})..."
    COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 \
      docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" build "${COMPOSE_BUILD_OPTS[@]}"
    COMPOSE_BUILD_RUN=1
fi
if [ "$COMPOSE_BUILD_RUN" -eq 1 ]; then
    docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" up
else
    docker compose -f docker-compose.prod.yml --env-file "${COMPOSE_ENV_FILE}" up --build
fi
