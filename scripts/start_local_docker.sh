#!/bin/sh
# Wrapper to start the local Docker stack with migrations enabled by default.
# Usage: AUTO_MIGRATE=true ./scripts/start_local_docker.sh

set -e

# Default AUTO_MIGRATE to true if not provided
export AUTO_MIGRATE="${AUTO_MIGRATE:-true}"

# Pass through other env vars (AUTO_SEED, SEED_GAMES, ENV_FILE, etc.) to start_local.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${SCRIPT_DIR}/start_local.sh" "$@"
