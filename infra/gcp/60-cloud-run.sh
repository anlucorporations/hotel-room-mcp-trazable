#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 60 — Cloud Run
#
# Despliega un servicio de validación (imagen pública "hello") para comprobar
# que la plataforma, la cuenta de servicio y la red están bien configuradas.
#
# IMPORTANTE: es un PLACEHOLDER. Cuando exista la imagen real de `apps/web`,
# se sustituye con:
#
#   gcloud run deploy hotel-mcp-web \
#     --image=europe-west1-docker.pkg.dev/<PROJECT_ID>/hotel-mcp/web:<tag> \
#     --region=europe-west1 --service-account=hotel-mcp-run@<PROJECT_ID>.iam.gserviceaccount.com \
#     --add-cloudsql-instances=<connectionName> \
#     --set-secrets=SESSION_SECRET=hotel-session-secret:latest,JWT_SECRET=hotel-jwt-secret:latest \
#     --network=hotel-mcp-vpc --subnet=hotel-mcp-euw1 --vpc-egress=private-ranges-only
#
# Idempotente (redeploy).
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

PROJECT="$GCP_PROJECT_ID"
SERVICE="${GCP_RUN_SERVICE:-hotel-mcp-health}"
IMAGE="${GCP_RUN_PLACEHOLDER_IMAGE:-us-docker.pkg.dev/cloudrun/container/hello}"

echo "==> Desplegando placeholder $SERVICE en $GCP_REGION..."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" --region="$GCP_REGION" \
  --image="$IMAGE" \
  --service-account="$GCP_RUN_SA" \
  --no-allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --cpu=1 --memory=256Mi \
  --network="hotel-mcp-vpc" --subnet="hotel-mcp-euw1" \
  --vpc-egress=private-ranges-only \
  --labels=app=hotel-mcp,role=placeholder \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" \
        --region="$GCP_REGION" --format='value(status.url)')"
echo "==> URL del servicio: $URL"
echo "   (privado: requiere token de identidad para invocarlo)"
