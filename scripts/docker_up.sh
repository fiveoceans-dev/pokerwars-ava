#!/usr/bin/env bash
set -euo pipefail

# Spin up the local stack using the production-ish compose file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-pokerwars-pg}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-pokerwars}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed or not on PATH." >&2
  exit 1
fi

# Load env overrides if present (helpful for NEXT_PUBLIC_* and ALLOWED_WS_ORIGINS).
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
  echo "Loaded environment overrides from $ENV_FILE"
fi

DETACH_FLAG=()
if [[ "${DETACH:-}" == "1" || "${DETACH:-}" == "true" ]]; then
  DETACH_FLAG+=("-d")
fi

# Ensure local Postgres is running (optional but convenient)
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER_NAME}\$"; then
  echo "Starting local Postgres container '${POSTGRES_CONTAINER_NAME}' on port ${POSTGRES_PORT}..."
  docker run --name "${POSTGRES_CONTAINER_NAME}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -p "${POSTGRES_PORT}:5432" \
    -d "${POSTGRES_IMAGE}" >/dev/null
else
  echo "Postgres container '${POSTGRES_CONTAINER_NAME}' already running."
fi

# If DATABASE_URL is unset, set a sane default pointing at the local Postgres container
if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@host.docker.internal:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
  echo "DATABASE_URL not set; defaulting to ${DATABASE_URL}"
fi

# Basic defaults for web/ws URLs if not provided
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:8090}"
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-ws://localhost:8099}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8099/api}"
export ALLOWED_WS_ORIGINS="${ALLOWED_WS_ORIGINS:-http://localhost:8090}"

# Normalize comma-separated URLs to first entry for build args
if [[ "${NEXT_PUBLIC_APP_URL}" == *","* ]]; then
  NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL%%,*}"
fi
if [[ "${NEXT_PUBLIC_WS_URL}" == *","* ]]; then
  NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL%%,*}"
fi
if [[ "${NEXT_PUBLIC_API_URL}" == *","* ]]; then
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL%%,*}"
fi

echo "Using compose file: $COMPOSE_FILE"
echo "Starting containers (docker compose up --build ${DETACH_FLAG[*]-})..."

docker compose -f "$COMPOSE_FILE" up --build ${DETACH_FLAG[@]+"${DETACH_FLAG[@]}"} "$@"

if [[ "${AUTO_MIGRATE:-}" == "1" || "${AUTO_MIGRATE:-}" == "true" ]]; then
  "$ROOT_DIR/scripts/db_bootstrap.sh"
fi
