#!/usr/bin/env bash
set -euo pipefail

# Spin up the local stack using the production-ish compose file.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"

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

echo "Using compose file: $COMPOSE_FILE"
echo "Starting containers (docker compose up --build ${DETACH_FLAG[*]})..."

exec docker compose -f "$COMPOSE_FILE" up --build "${DETACH_FLAG[@]}" "$@"
