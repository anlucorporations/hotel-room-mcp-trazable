#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# F8 · Construye las CUATRO imágenes de la release (web, worker, mcp, monitor)
# con el registro de despliegue VIGENTE de `packages/shared/deployments/`.
#
# Por defecto **simula** (imprime los comandos y no llama a GCP).
#   bash infra/gcp/f8-build-images.sh                 # dry-run
#   bash infra/gcp/f8-build-images.sh --execute       # construye de verdad
#   GCP_IMAGE_TAG=f8 bash infra/gcp/f8-build-images.sh
#
# Se ejecuta DESPUÉS del despliegue del contrato y de `pnpm sync`, para que el
# registro (dirección, bloque y faucet) ya sea el nuevo.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

EXECUTE=0
TAG="${GCP_IMAGE_TAG:-f8}"
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=1 ;;
    --dry-run) EXECUTE=0 ;;
    --tag=*) TAG="${arg#--tag=}" ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_AR_REPO}"
CHAIN_ID="${GCP_ANVIL_CHAIN_ID}"
DEP_FILE="$REPO_ROOT/packages/shared/deployments/${CHAIN_ID}.json"

if [[ ! -f "$DEP_FILE" ]]; then
  echo "ERROR: no existe el registro $DEP_FILE (¿contrato sin desplegar/sincronizar?)" >&2
  exit 1
fi

# Dirección, bloque y faucet del registro vigente.
read -r CONTRACT DEPLOY_BLOCK FAUCET <<<"$(
  node -e "const d=require('${DEP_FILE}');console.log([d.address,d.deploymentBlock,d.faucet ?? ''].join(' '))"
)"
echo "==> Registro $CHAIN_ID: contrato $CONTRACT · bloque $DEPLOY_BLOCK · faucet ${FAUCET:-—}"
echo "==> Tag de release: $TAG"

WEB_SUBS="_NEXT_PUBLIC_SITE_URL=${GCP_WEB_URL},_NEXT_PUBLIC_RPC_URL=${GCP_ANVIL_URL},_NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID},_NEXT_PUBLIC_CONTRACT_ADDRESS=${CONTRACT},_NEXT_PUBLIC_DEPLOYMENT_BLOCK=${DEPLOY_BLOCK},_NEXT_PUBLIC_FAUCET_ADDRESS=${FAUCET},_NEXT_PUBLIC_NETWORK="

build() {
  local app="$1" extra="$2"
  local image="${REGISTRY}/${app}:${TAG}"
  local substitutions="_APP=${app},_IMAGE=${image}${extra}"
  if [[ "$EXECUTE" != "1" ]]; then
    echo "  [dry-run] gcloud builds submit --project=${GCP_PROJECT_ID} \\"
    echo "              --config=infra/docker/cloudbuild.yaml \\"
    echo "              --substitutions=${substitutions} ."
    return
  fi
  echo "==> Construyendo ${app} -> ${image}"
  gcloud builds submit --project="$GCP_PROJECT_ID" --config=infra/docker/cloudbuild.yaml \
    --substitutions="$substitutions" .
}

cd "$REPO_ROOT"
build web    ",${WEB_SUBS}"
build worker ""
build mcp    ""
build monitor ""

if [[ "$EXECUTE" != "1" ]]; then
  echo
  echo "SIMULACIÓN: no se ha llamado a GCP. Añade --execute para construir las 4 imágenes."
fi
