#!/usr/bin/env bash
set -euo pipefail

# Helper to generate --substitutions string for gcloud builds submit
# Usage: ./scripts/get_gcloud_substitutions.sh <image_uri> <build_target>

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/constants.sh"

IMAGE_URI="$1"
BUILD_TARGET="$2"

sanitize() {
  echo "$1" | tr -d "\"'\r\n"
}

escape_subs() {
  local value
  value="$(sanitize "$1")"
  value="${value//\\/\\\\}"
  value="${value//,/\\,}"
  value="${value//=/\\=}"
  echo "$value"
}

SUBS=(
  "_IMAGE_URI=$(escape_subs "$IMAGE_URI")"
  "_BUILD_TARGET=$(escape_subs "$BUILD_TARGET")"
)

for var in "${NEXT_PUBLIC_VARS[@]}"; do
  SUBS+=("_$var=$(escape_subs "${!var:-}")")
done

IFS=,
echo "${SUBS[*]}"
unset IFS
