#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"
ENV_FILES=(
  "$ROOT_DIR/apps/web/.env"
  "$ROOT_DIR/.env.gcp"
  "$ENV_FILE"
  "$ROOT_DIR/.env"
)

for f in "${ENV_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    set -a
    . "$f"
    set +a
    echo "Loaded env from $f"
  fi
done

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${DATABASE_URL:?Missing DATABASE_URL}"

JOB_NAME="${JOB_NAME:-pokerwars-prisma-migrate}"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

gcloud builds submit "$ROOT_DIR" --tag "$IMAGE_URI"

gcloud run jobs create "$JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --set-env-vars="^;^SERVICE=ws-server;NODE_ENV=production;DATABASE_URL=${DATABASE_URL}" \
  --command="npm" \
  --args="run,prisma:migrate,-w,apps/ws-server"

gcloud run jobs execute "$JOB_NAME" --region "$REGION"

echo "Prisma migrate job executed: $JOB_NAME"
