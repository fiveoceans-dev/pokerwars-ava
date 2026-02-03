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
: "${DB_INSTANCE:?Missing DB_INSTANCE (Cloud SQL instance name)}"

urlencode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
    return
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
    return
  fi
  echo "$1"
}

if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  ENCODED_USER="$(urlencode "$DB_USER")"
  ENCODED_PASS="$(urlencode "$DB_PASSWORD")"
  DATABASE_URL_EFFECTIVE="postgresql://${ENCODED_USER}:${ENCODED_PASS}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
else
  DATABASE_URL_EFFECTIVE="${DATABASE_URL_CLOUD:-${DATABASE_URL:-}}"
fi

: "${DATABASE_URL_EFFECTIVE:?Missing DATABASE_URL (or DATABASE_URL_CLOUD/DB_*)}"

if [[ "${DATABASE_URL_EFFECTIVE}" == *"\$"* ]]; then
  echo "DATABASE_URL contains unresolved variables: ${DATABASE_URL_EFFECTIVE}" >&2
  exit 1
fi



JOB_NAME="${JOB_NAME:-pokerwars-prisma-migrate}"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
DEFAULT_IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_NAME:$IMAGE_TAG"

echo "Setting gcloud project..."
gcloud config set project "$PROJECT_ID" >/dev/null
echo "Ensuring required services are enabled (this can take a minute)..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null

# Ensure the job service account can access Cloud SQL.
if [[ -n "${SERVICE_ACCOUNT:-}" ]]; then
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client" \
    >/dev/null 2>&1 || true
fi

# Optional VPC connector creation for private IP connectivity
if [[ "${CREATE_VPC_CONNECTOR:-}" == "true" ]]; then
  CONNECTOR_NAME="${VPC_CONNECTOR:-pokerwars-vpc-connector}"
  if ! gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" --region "$REGION" >/dev/null 2>&1; then
    gcloud compute networks vpc-access connectors create "$CONNECTOR_NAME" \
      --region "$REGION" \
      --network "${VPC_NETWORK:-default}" \
      --range "${VPC_RANGE:-10.8.0.0/28}"
  fi
fi

if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

# Build only ws-server + engine (no web build)
IMAGE_URI="${PRISMA_IMAGE_URI:-$DEFAULT_IMAGE_URI}"
if [[ "${SKIP_PRISMA_BUILD:-}" == "true" || "${SKIP_PRISMA_BUILD:-}" == "1" ]]; then
  if [[ -z "${PRISMA_IMAGE_URI:-}" ]]; then
    echo "SKIP_PRISMA_BUILD=true but PRISMA_IMAGE_URI is not set." >&2
    exit 1
  fi
  echo "Skipping build; using existing image: $IMAGE_URI"
else
  echo "Submitting Cloud Build for Prisma job image (this can take several minutes)..."
  gcloud builds submit "$ROOT_DIR" \
    --config "$ROOT_DIR/cloudbuild.prisma.yaml" \
    --substitutions=_IMAGE_URI="$IMAGE_URI"
fi

JOB_EXISTS=false
if gcloud run jobs describe "$JOB_NAME" --region "$REGION" >/dev/null 2>&1; then
  JOB_EXISTS=true
fi

CLOUDSQL_CONN="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
ENV_OUT_DIR="${ENV_OUT_DIR:-$ROOT_DIR/.env.generated}"
"$ROOT_DIR/scripts/build_cloudrun_env.sh"
PRISMA_ENV_FILE="$ENV_OUT_DIR/env.prisma.env"
ENV_VARS="^;^$(tr '\n' ';' < "$PRISMA_ENV_FILE" | sed 's/;*$//')"

JOB_ARGS=(
  --image "$IMAGE_URI"
  --region "$REGION"
  --set-env-vars="$ENV_VARS"
  --set-env-vars="AUTO_SEED=${AUTO_SEED:-}"
  --add-cloudsql-instances "$CLOUDSQL_CONN"
  # --command "npm"
  # --args "run,prisma:migrate:deploy,-w,apps/ws-server"

  --command "bash"
  --args "-c,echo '=== DB DEBUG ===' && echo DATABASE_URL: \$DATABASE_URL && echo AUTO_SEED: \$AUTO_SEED && psql \$DATABASE_URL -c 'SELECT 1' >/dev/null 2>&1 && echo 'DB OK' || echo 'DB FAIL' && echo '=== PRISMA ===' && cd /app/apps/ws-server && npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1 && npx prisma generate && if [[ \"\${AUTO_SEED:-}\" == \"1\" || \"\${AUTO_SEED:-}\" == \"true\" ]]; then echo '=== SEEDING ===' && echo 'Running npm run seed:all' && npm run seed:all && echo 'Seeding: SUCCESS' && psql \$DATABASE_URL -c 'SELECT COUNT(*) FROM \"Treasury\";' 2>/dev/null && echo 'Treasury seeded' || echo 'Treasury check failed'; else echo 'Seeding: SKIPPED (AUTO_SEED=false)'; fi && echo 'DONE' || echo 'Migration failed'"
)

if [[ -n "${SERVICE_ACCOUNT:-}" ]]; then
  JOB_ARGS+=(--service-account "$SERVICE_ACCOUNT")
fi

if [[ "${USE_VPC_CONNECTOR:-}" == "true" && -n "${VPC_CONNECTOR:-}" ]]; then
  JOB_ARGS+=(--vpc-connector "$VPC_CONNECTOR")
  if [[ -n "${VPC_EGRESS:-}" ]]; then
    JOB_ARGS+=(--vpc-egress "$VPC_EGRESS")
  fi
fi

if [[ "$JOB_EXISTS" == "true" ]]; then
  echo "Updating Cloud Run job $JOB_NAME..."
  gcloud run jobs update "$JOB_NAME" "${JOB_ARGS[@]}"
else
  echo "Creating Cloud Run job $JOB_NAME..."
  gcloud run jobs create "$JOB_NAME" "${JOB_ARGS[@]}"
fi

if [[ "${JOB_ASYNC:-}" == "true" || "${JOB_ASYNC:-}" == "1" ]]; then
  echo "Executing job asynchronously (JOB_ASYNC=true)..."
  gcloud run jobs execute "$JOB_NAME" --region "$REGION" --async
else
  echo "Executing job (waiting for completion)..."
  gcloud run jobs execute "$JOB_NAME" --region "$REGION"
fi

echo "Prisma migrate job executed: $JOB_NAME"
