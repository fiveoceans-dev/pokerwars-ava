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

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
: "${DATABASE_URL_EFFECTIVE:?Missing DATABASE_URL (or DATABASE_URL_CLOUD)}"
: "${DB_INSTANCE:?Missing DB_INSTANCE (Cloud SQL instance name)}"

JOB_NAME="${JOB_NAME:-pokerwars-prisma-migrate}"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_NAME:$IMAGE_TAG"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

# Build only ws-server + engine (no web build)
gcloud builds submit "$ROOT_DIR" \
  --config "$ROOT_DIR/cloudbuild.prisma.yaml" \
  --substitutions=_IMAGE_URI="$IMAGE_URI"

JOB_EXISTS=false
if gcloud run jobs describe "$JOB_NAME" --region "$REGION" >/dev/null 2>&1; then
  JOB_EXISTS=true
fi

CLOUDSQL_CONN="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
ENV_VARS="^;^NODE_ENV=production;DATABASE_URL=${DATABASE_URL_EFFECTIVE}"

JOB_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --set-env-vars="$ENV_VARS"
  --add-cloudsql-instances "$CLOUDSQL_CONN"
  --command "npm"
  --args "run,prisma:migrate:deploy,-w,apps/ws-server"
)

if [[ "${USE_VPC_CONNECTOR:-}" == "true" && -n "${VPC_CONNECTOR:-}" ]]; then
  JOB_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
  if [[ -n "${VPC_EGRESS:-}" ]]; then
    JOB_ARGS+=(--vpc-egress "$VPC_EGRESS")
  fi
fi

if [[ "$JOB_EXISTS" == "true" ]]; then
  gcloud run jobs update "$JOB_NAME" "${JOB_ARGS[@]}"
else
  gcloud run jobs create "$JOB_NAME" "${JOB_ARGS[@]}"
fi

gcloud run jobs execute "$JOB_NAME" --region "$REGION"

echo "Prisma migrate job executed: $JOB_NAME"
