#!/usr/bin/env bash
set -euo pipefail

# Full Stack Deployment Script for GCP
# 1. Setup Infra (SQL, VPC, etc.)
# 2. Build both images in parallel via Cloud Build
# 3. Run Prisma Migrations
# 4. Deploy both services to Cloud Run

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${PROJECT_ID:?Missing PROJECT_ID}"
: "${REGION:?Missing REGION}"
: "${REPO_NAME:?Missing REPO_NAME}"
: "${WEB_SERVICE_NAME:?Missing WEB_SERVICE_NAME}"
: "${WS_SERVICE_NAME:?Missing WS_SERVICE_NAME}"

# 1. Setup Infra (Idempotent)
echo "🏗️  Setting up GCP infrastructure..."
"$ROOT_DIR/scripts/gcp_setup_infra.sh"

# 2. Prepare build params
IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
WEB_IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WEB_SERVICE_NAME:$IMAGE_TAG"
WS_IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$WS_SERVICE_NAME:$IMAGE_TAG"

. "$ROOT_DIR/scripts/constants.sh"
# Generate substitutions for both (we use a union of variables)
# We can't use get_gcloud_substitutions directly as it's targeted for one.
# Manually constructing for the 'all' config:
SUBS=(
  "_WEB_IMAGE_URI=$WEB_IMAGE_URI"
  "_WS_IMAGE_URI=$WS_IMAGE_URI"
)
sanitize() { echo "$1" | tr -d ""'
"; }
escape_subs() {
  local v; v="$(sanitize "$1")"
  v="${v//\/\}"; v="${v//,/\,}"; v="${v//=/\=}"
  echo "$v"
}
for var in "${NEXT_PUBLIC_VARS[@]}"; do
  SUBS+=("_$var=$(escape_subs "${!var:-}")")
done
IFS=,
SUBS_STR="${SUBS[*]}"
unset IFS

# 3. Parallel Build
echo "🚀 Building Web and WS images in parallel..."
gcloud builds submit "$ROOT_DIR" 
  --config "$ROOT_DIR/cloudbuild.all.yaml" 
  --substitutions="$SUBS_STR"

# 4. Generate Env Files
ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"

# 5. Run Migrations
AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
if [[ "${SKIP_MIGRATE:-}" != "true" && "${AUTO_MIGRATE}" == "true" ]]; then
  echo "🏃 Running Prisma migrations..."
  IMAGE_FOR_JOB="$WS_IMAGE_URI" 
  ENV_FILE_FOR_JOB="$ENV_OUT_DIR/env.ws.yaml" 
  DB_INSTANCE="${DB_INSTANCE:-}" 
  AUTO_SEED="${AUTO_SEED:-true}" 
  AUTO_GRANT_DB="${AUTO_GRANT_DB:-}" 
  "$ROOT_DIR/scripts/run_prisma_job.sh"
fi

# 6. Deploy Services
echo "📦 Deploying services to Cloud Run..."

# Deploy WS
WS_DEPLOY_ARGS=(
  --image "$WS_IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --env-vars-file="$ENV_OUT_DIR/env.ws.yaml"
)
if [[ -n "${DB_INSTANCE:-}" ]]; then
  WS_DEPLOY_ARGS+=(--add-cloudsql-instances "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")
fi
if [[ -n "${VPC_CONNECTOR:-}" && "${USE_VPC_CONNECTOR:-}" == "true" ]]; then
  WS_DEPLOY_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
fi

gcloud run deploy "$WS_SERVICE_NAME" "${WS_DEPLOY_ARGS[@]}" &
WS_PID=$!

# Deploy Web
WEB_DEPLOY_ARGS=(
  --image "$WEB_IMAGE_URI"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --env-vars-file="$ENV_OUT_DIR/env.web.yaml"
)
if [[ -n "${VPC_CONNECTOR:-}" && "${USE_VPC_CONNECTOR:-}" == "true" ]]; then
  WEB_DEPLOY_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
fi

gcloud run deploy "$WEB_SERVICE_NAME" "${WEB_DEPLOY_ARGS[@]}" &
WEB_PID=$!

wait $WS_PID $WEB_PID

echo "✅ Full stack deployment complete!"
