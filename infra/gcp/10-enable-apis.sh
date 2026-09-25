#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 10 — Habilitación de APIs
#
# Habilita el conjunto de APIs necesario para: IAM/WIF, Artifact Registry,
# Cloud Build, Cloud Run, Cloud SQL y Secret Manager.
#
# Las APIs de la segunda lista requieren facturación activa.
# Idempotente.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

# APIs sin coste / habilitables sin facturación
APIS_BASE=(
  cloudresourcemanager.googleapis.com
  serviceusage.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  cloudbilling.googleapis.com
  sqladmin.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
  servicenetworking.googleapis.com
  sts.googleapis.com
)

# APIs que exigen facturación activa
APIS_BILLING=(
  artifactregistry.googleapis.com
  run.googleapis.com
  cloudbuild.googleapis.com
  secretmanager.googleapis.com
  vpcaccess.googleapis.com
  compute.googleapis.com
)

enable() {
  local api="$1"
  if gcloud services list --enabled --project="$GCP_PROJECT_ID" \
       --filter="config.name=$api" --format="value(config.name)" | grep -q .; then
    echo "    ya habilitada: $api"
  else
    echo "    habilitando: $api"
    gcloud services enable "$api" --project="$GCP_PROJECT_ID"
  fi
}

echo "==> APIs base"
for api in "${APIS_BASE[@]}"; do enable "$api"; done

echo "==> APIs con facturación"
for api in "${APIS_BILLING[@]}"; do enable "$api"; done

echo "==> APIs habilitadas en $GCP_PROJECT_ID:"
gcloud services list --enabled --project="$GCP_PROJECT_ID" \
  --format="value(config.name)" | sort
