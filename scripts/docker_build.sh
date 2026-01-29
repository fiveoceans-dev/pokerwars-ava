#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${TAG:-pokerwars:local}"
BUILD_TARGET="${BUILD_TARGET:-all}" # web | ws-server | all

echo "Building Docker image: $TAG (BUILD_TARGET=$BUILD_TARGET)"
docker build "$ROOT_DIR" \
  -t "$TAG" \
  --build-arg BUILD_TARGET="$BUILD_TARGET"
