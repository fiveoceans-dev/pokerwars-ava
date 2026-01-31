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

: "${DB_NAME:?Missing DB_NAME}"
: "${DB_USER:?Missing DB_USER}"

GRANT_USER="${GRANT_USER:-$DB_USER}"

if [[ -n "${DATABASE_URL_ADMIN:-}" ]]; then
  ADMIN_URL="$DATABASE_URL_ADMIN"
elif [[ -n "${DB_ADMIN_USER:-}" && -n "${DB_ADMIN_PASSWORD:-}" ]]; then
  if [[ -n "${DB_HOST:-}" ]]; then
    DB_PORT_EFFECTIVE="${DB_PORT:-5432}"
    ADMIN_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_HOST}:${DB_PORT_EFFECTIVE}/${DB_NAME}"
  elif [[ -n "${PROJECT_ID:-}" && -n "${REGION:-}" && -n "${DB_INSTANCE:-}" ]]; then
    ADMIN_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
  else
    echo "Missing DB_HOST or (PROJECT_ID/REGION/DB_INSTANCE) for admin connection." >&2
    exit 1
  fi
elif [[ -n "${DB_HOST:-}" && -n "${DB_PASSWORD:-}" ]]; then
  DB_PORT_EFFECTIVE="${DB_PORT:-5432}"
  ADMIN_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT_EFFECTIVE}/${DB_NAME}"
  echo "Warning: using DB_USER credentials; grants may fail if role lacks privileges." >&2
elif [[ -n "${PROJECT_ID:-}" && -n "${REGION:-}" && -n "${DB_INSTANCE:-}" && -n "${DB_PASSWORD:-}" ]]; then
  ADMIN_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
  echo "Warning: using DB_USER credentials; grants may fail if role lacks privileges." >&2
else
  echo "Missing DATABASE_URL_ADMIN or DB_ADMIN_USER/DB_ADMIN_PASSWORD (fallback to DB_USER also unavailable)." >&2
  exit 1
fi

echo "Granting privileges for role: ${GRANT_USER}"

psql -v ON_ERROR_STOP=1 "$ADMIN_URL" <<SQL
GRANT CONNECT ON DATABASE "${DB_NAME}" TO "${GRANT_USER}";
GRANT USAGE, CREATE ON SCHEMA public TO "${GRANT_USER}";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${GRANT_USER}";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${GRANT_USER}";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${GRANT_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${GRANT_USER}";
SQL

echo "Grants applied for ${GRANT_USER} on ${DB_NAME}.public"
