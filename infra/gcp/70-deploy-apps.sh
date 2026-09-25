#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 70 — Despliegue de las aplicaciones en Cloud Run
#
# Servicios: worker, mcp, web (en este orden, porque la web necesita las URLs
# del worker y del MCP). El monitor se trata aparte (no expone HTTP).
#
# Servicios globales consumidos:
#   - Anvil:    https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app (chainId 31337)
#   - Postgres: Cloud SQL hotel-mcp-pg (IP privada 10.104.0.3)
#   - Redis:    VM hotel-mcp-redis (10.10.0.10)
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

ANVIL_URL="${GCP_ANVIL_URL:-https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app}"
IMAGE_TAG="${GCP_IMAGE_TAG:-v1}"
REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/hotel-mcp"
NETWORK="hotel-mcp-vpc"
SUBNET="hotel-mcp-euw1"
CHAIN_ID=31337

DEP_FILE="$REPO_ROOT/packages/shared/deployments/${CHAIN_ID}.json"
CONTRACT="$(node -e "console.log(require('${DEP_FILE}').address)")"
FAUCET="$(node -e "console.log(require('${DEP_FILE}').faucet ?? '')")"
DEPLOY_BLOCK="$(node -e "console.log(require('${DEP_FILE}').deploymentBlock)")"
echo "==> Contrato $CONTRACT en bloque $DEPLOY_BLOCK (chainId $CHAIN_ID)"

# Secreto compartido web -> MCP (el cliente lo envía como Bearer).
if ! gcloud secrets describe hotel-mcp-shared-secret --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  openssl rand -base64 32 | tr -d '\n' | gcloud secrets create hotel-mcp-shared-secret \
    --project="$GCP_PROJECT_ID" --replication-policy=automatic \
    --labels=app=hotel-mcp --data-file=-
  echo "==> hotel-mcp-shared-secret creado"
fi

COMMON_ENV="RPC_URL=${ANVIL_URL},CHAIN_ID=${CHAIN_ID},CONTRACT_ADDRESS=${CONTRACT},DEPLOYMENT_BLOCK=${DEPLOY_BLOCK}"
COMMON_SECRETS="DATABASE_URL=hotel-database-url:latest,REDIS_URL=hotel-redis-url:latest"
SMTP_ENV="SMTP_HOST=smtp.invalid,SMTP_PORT=587,SMTP_USER=hotel@example.com,SMTP_PASS=,SMTP_FROM=no-reply@example.com"

echo "==> Desplegando worker"
gcloud run deploy hotel-mcp-worker \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="${REGISTRY}/worker:${IMAGE_TAG}" \
  --service-account="$GCP_RUN_SA" \
  --port=8080 --no-cpu-throttling --min-instances=1 --max-instances=1 \
  --no-allow-unauthenticated \
  --set-env-vars="${COMMON_ENV},WORKER_HOST=0.0.0.0,WORKER_PORT=8080,${SMTP_ENV},ADMIN_EMAIL=admin@example.com" \
  --set-secrets="${COMMON_SECRETS}" \
  --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
  --quiet
WORKER_URL="$(gcloud run services describe hotel-mcp-worker --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" --format='value(status.url)')"
echo "    worker -> $WORKER_URL"

echo "==> Desplegando mcp"
gcloud run deploy hotel-mcp-mcp \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="${REGISTRY}/mcp:${IMAGE_TAG}" \
  --service-account="$GCP_RUN_SA" \
  --port=8080 --allow-unauthenticated \
  --min-instances=0 --max-instances=2 \
  --set-env-vars="${COMMON_ENV},MCP_HOST=0.0.0.0,MCP_PORT=8080" \
  --set-secrets="${COMMON_SECRETS}" \
  --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
  --quiet
MCP_URL="$(gcloud run services describe hotel-mcp-mcp --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" --format='value(status.url)')"
echo "    mcp -> $MCP_URL"

echo "==> Desplegando web"
gcloud run deploy hotel-mcp-web \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="${REGISTRY}/web:${IMAGE_TAG}" \
  --service-account="$GCP_RUN_SA" \
  --port=3000 --allow-unauthenticated \
  --min-instances=0 --max-instances=3 --cpu=1 --memory=1Gi \
  --set-env-vars="${COMMON_ENV},MCP_BASE_URL=${MCP_URL}/mcp,WORKER_BASE_URL=${WORKER_URL},LOG_LEVEL=info" \
  --set-secrets="${COMMON_SECRETS},SESSION_SECRET=hotel-session-secret:latest,JWT_SECRET=hotel-jwt-secret:latest,TICKET_SIGNING_SECRET=hotel-ticket-signing-secret:latest,CHECKIN_SECRET_KEY=hotel-checkin-secret-key:latest,AES_SECRET_KEY=hotel-aes-secret-key:latest,MCP_SHARED_SECRET=hotel-mcp-shared-secret:latest" \
  --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
  --quiet
WEB_URL="$(gcloud run services describe hotel-mcp-web --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" --format='value(status.url)')"
echo "    web -> $WEB_URL"

echo
echo "==> URLs"
echo "WEB_URL=$WEB_URL"
echo "MCP_URL=$MCP_URL"
echo "WORKER_URL=$WORKER_URL"
