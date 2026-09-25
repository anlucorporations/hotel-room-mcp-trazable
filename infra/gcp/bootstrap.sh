#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bootstrap — Ejecuta toda la preparación de GCP en orden.
#
#   bash infra/gcp/bootstrap.sh
#
# Cada paso es idempotente y se puede ejecutar por separado.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for s in 00-bootstrap-project.sh \
         10-enable-apis.sh \
         20-iam-and-wif.sh \
         30-artifact-registry.sh \
         40-cloud-sql.sh \
         50-secrets.sh \
         60-cloud-run.sh; do
  echo
  echo "############ $s ############"
  bash "$HERE/$s"
done

echo
echo "############ RESUMEN ############"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"
gcloud projects describe "$GCP_PROJECT_ID" --format="yaml(projectId,name,projectNumber,parent)"
echo "Artifact Registry: ${GCP_AR_HOST}/${GCP_PROJECT_ID}/${GCP_AR_REPO}"
echo "Cloud SQL:         $GCP_SQL_INSTANCE ($GCP_REGION, IP privada)"
echo "Cloud Run SA:      $GCP_RUN_SA"
echo "CI SA:             $GCP_CI_SA"
