#!/usr/bin/env bash
set -euo pipefail

# Setup GCP Infrastructure (SQL, VPC, Services, Artifact Registry)
# This script is idempotent and should be run once before deployments
# or when infrastructure changes are needed.

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

echo "⚙️  Configuring GCP project and enabling services..."
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable 
  run.googleapis.com 
  artifactregistry.googleapis.com 
  cloudbuild.googleapis.com 
  sqladmin.googleapis.com 
  compute.googleapis.com 
  vpcaccess.googleapis.com 
  >/dev/null

echo "📦 Ensuring Artifact Registry exists..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION"
fi

# Cloud SQL creation (idempotent)
if [[ "${CREATE_CLOUDSQL:-}" == "true" && -n "${DB_INSTANCE:-}" ]]; then
  echo "🗄️ Checking Cloud SQL instance: $DB_INSTANCE"
  if ! gcloud sql instances describe "$DB_INSTANCE" >/dev/null 2>&1; then
    echo "Creating Cloud SQL instance (this may take several minutes)..."
    gcloud sql instances create "$DB_INSTANCE" 
      --region "$REGION" 
      --database-version=POSTGRES_15 
      --tier "${DB_TIER:-db-f1-micro}"
  fi
  if [[ -n "${DB_NAME:-}" ]]; then
    echo "Ensuring database $DB_NAME exists..."
    gcloud sql databases create "$DB_NAME" --instance "$DB_INSTANCE" >/dev/null 2>&1 || true
  fi
fi

# VPC connector (idempotent)
if [[ "${CREATE_VPC_CONNECTOR:-}" == "true" && -n "${VPC_CONNECTOR:-}" ]]; then
  echo "🌐 Checking VPC Connector: $VPC_CONNECTOR"
  if ! gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" --region "$REGION" >/dev/null 2>&1; then
    echo "Creating VPC Connector..."
    gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" 
      --region "$REGION" 
      --network "${VPC_NETWORK:-default}" 
      --range "${VPC_RANGE:-10.8.0.0/28}"
  fi
fi

echo "✅ Infrastructure setup complete."
