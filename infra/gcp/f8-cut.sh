#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# F8 · Orquestador del corte de contrato (D-24). NO hace nada por defecto:
# sin `--execute` solo IMPRIME el plan. Diseñado para que el responsable
# autorice y ejecute fase a fase.
#
#   bash infra/gcp/f8-cut.sh                         # plan (no toca nada)
#   bash infra/gcp/f8-cut.sh --phase=backup   --execute
#   bash infra/gcp/f8-cut.sh --phase=contract --execute
#   bash infra/gcp/f8-cut.sh --phase=build    --execute
#   bash infra/gcp/f8-cut.sh --phase=deploy   --execute
#   bash infra/gcp/f8-cut.sh --phase=verify   --execute
#
# Las fases que tocan la BASE DE DATOS (reset y siembra) NO se ejecutan desde
# aquí: Cloud SQL es de IP privada y deben correr como job de Cloud Run dentro
# de la VPC. Se imprimen como pasos guiados (`--phase=reset|seed`).
# Detalle completo y respaldo/rollback: RepoTecnico/F8-preflight.md
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

PHASE="plan"
EXECUTE=0
TAG="${GCP_IMAGE_TAG:-f8}"
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=1 ;;
    --dry-run) EXECUTE=0 ;;
    --phase=*) PHASE="${arg#--phase=}" ;;
    --tag=*) TAG="${arg#--tag=}" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

DEP_FILE="$REPO_ROOT/packages/shared/deployments/${GCP_ANVIL_CHAIN_ID}.json"
REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_AR_REPO}"
SEED_JOB="${GCP_SEED_JOB:-hotel-mcp-inject-data}"
MONITOR_POOL="${GCP_MONITOR_POOL:-hotel-mcp-monitor}"

# `run` ejecuta si --execute; si no, imprime la línea.
run() {
  if [[ "$EXECUTE" == "1" ]]; then
    echo "+ $*"
    "$@"
  else
    echo "  [simulado] $*"
  fi
}

guard_execute() {
  if [[ "$PHASE" != "plan" && "$EXECUTE" != "1" ]]; then
    echo "(simulación) Fase '$PHASE': añade --execute para ejecutarla de verdad."
  fi
}

preflight() {
  echo "==> Preflight (local, sin tocar GCP)"
  cd "$REPO_ROOT"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "  AVISO: el árbol de trabajo NO está limpio." >&2
  else
    echo "  árbol de git limpio"
  fi
  echo "  commit: $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"
  command -v forge >/dev/null 2>&1 || [[ -x "$HOME/.foundry/bin/forge" ]] \
    && echo "  forge: OK" || echo "  AVISO: forge no encontrado en PATH ni en ~/.foundry/bin"
  if [[ -f "$DEP_FILE" ]]; then
    node -e "const d=require('${DEP_FILE}');console.log('  registro actual:',d.address,'bloque',d.deploymentBlock,'faucet',d.faucet??'—')"
  else
    echo "  AVISO: falta $DEP_FILE" >&2
  fi
  echo "  (el respaldo de Cloud SQL y las claves verificadas van en la fase 'backup')"
}

phase_backup() {
  echo "==> Fase A · Respaldo (Cloud SQL)"
  echo "  Captura el estado ANTES de tocar nada:"
  run gcloud sql backups create --instance="$GCP_SQL_INSTANCE" --project="$GCP_PROJECT_ID" \
    --description="pre-F8 $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  (opcional, además) export a GCS con GCP_BACKUP_BUCKET:"
  echo "    gcloud sql export sql $GCP_SQL_INSTANCE gs://<\$GCP_BACKUP_BUCKET>/f8-<ts>.sql --database=$GCP_SQL_DATABASE --project=$GCP_PROJECT_ID"
  echo "  Verifica el respaldo ANTES de continuar:"
  echo "    gcloud sql backups list --instance=$GCP_SQL_INSTANCE --project=$GCP_PROJECT_ID --limit=3"
}

phase_contract() {
  echo "==> Fase B · Desplegar el contrato canónico ampliado y sincronizar el registro"
  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
    if [[ "$EXECUTE" == "1" ]]; then
      echo "  ERROR: exporta DEPLOYER_PRIVATE_KEY (cuenta 0) antes de esta fase." >&2
      exit 1
    fi
    echo "  (recuerda: en la ejecución real hay que exportar DEPLOYER_PRIVATE_KEY)"
  fi
  echo "  RPC: $GCP_ANVIL_URL (chainId $GCP_ANVIL_CHAIN_ID)"
  echo "  (guarda la dirección y bloque ACTUALES como rollback: ver preflight §Rollback)"
  run env PATH="$HOME/.foundry/bin:$PATH" RPC_URL="$GCP_ANVIL_URL" \
    DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-<clave>}" \
    DEPLOY_FAUCET="${DEPLOY_FAUCET:-true}" \
    bash -c "cd '$REPO_ROOT/packages/contracts' && forge script script/Deploy.s.sol:Deploy --rpc-url \"$GCP_ANVIL_URL\" --broadcast --slow"
  run bash -c "cd '$REPO_ROOT/packages/contracts' && pnpm sync"
  echo "  Registro nuevo (revísalo):"
  echo "    node -e \"console.log(require('$DEP_FILE'))\""
}

phase_reset() {
  echo "==> Fase C · Reset coordinado (D-15) — JOB de Cloud Run (BD por IP privada)"
  echo "  OJO: esto borra nfts, listings, sale_events y el estado del worker. Conserva admin_users."
  echo "  1) Captura la config del job de siembra ANTES de tocarlo:"
  echo "       gcloud run jobs describe $SEED_JOB --project=$GCP_PROJECT_ID --region=$GCP_REGION --format=export"
  echo "  2) Actualiza la imagen del job a la release F8 (conserva command/args/env):"
  echo "       gcloud run jobs update $SEED_JOB --project=$GCP_PROJECT_ID --region=$GCP_REGION \\"
  echo "         --image=$REGISTRY/mcp:$TAG"
  echo "  3) Ejecuta en modo seco y luego aplica (override de args del job):"
  echo "       gcloud run jobs execute $SEED_JOB --project=$GCP_PROJECT_ID --region=$GCP_REGION \\"
  echo "         --args='node --import tsx packages/shared/scripts/reset-index.ts'"
  echo "       gcloud run jobs execute $SEED_JOB --project=$GCP_PROJECT_ID --region=$GCP_REGION \\"
  echo "         --args='node --import tsx packages/shared/scripts/reset-index.ts --apply'"
  echo "  NOTA: si el job no admite override de args, crea un job dedicado con la misma"
  echo "        red/secretos del de siembra (ver F8-preflight.md §Fase C)."
}

phase_seed() {
  echo "==> Fase D · Sembrar habitaciones y registrarlas on-chain (D-3/D-13/D-14)"
  echo "  Con el job ya en la imagen F8 y el contrato nuevo en el entorno:"
  echo "    gcloud run jobs execute $SEED_JOB --project=$GCP_PROJECT_ID --region=$GCP_REGION"
  echo "  El paso 3.5 de inject-data vuelca el maestro en 'rooms' y registra las 50"
  echo "  habitaciones (idempotente) antes de mintear."
  echo "  Comprueba después (con cast, desde fuera):  isRoomRegistered(101) == true"
}

phase_build() {
  echo "==> Fase E1 · Construir las 4 imágenes con el registro NUEVO"
  if [[ "$EXECUTE" == "1" ]]; then
    GCP_IMAGE_TAG="$TAG" bash "$HERE/f8-build-images.sh" --execute
  else
    GCP_IMAGE_TAG="$TAG" bash "$HERE/f8-build-images.sh"
  fi
}

phase_deploy() {
  echo "==> Fase E2 · Redesplegar aplicaciones (worker, mcp, web) y el monitor"
  echo "  worker/mcp/web: 70-deploy-apps.sh lee el registro NUEVO y fija CONTRACT_ADDRESS/DEPLOYMENT_BLOCK"
  run env GCP_IMAGE_TAG="$TAG" bash "$HERE/70-deploy-apps.sh"
  echo "  monitor (worker pool): captura su config y redespliega SOLO la imagen"
  echo "    gcloud run worker-pools describe $MONITOR_POOL --project=$GCP_PROJECT_ID --region=$GCP_REGION --format=export"
  echo "    gcloud run worker-pools deploy $MONITOR_POOL --project=$GCP_PROJECT_ID --region=$GCP_REGION --image=$REGISTRY/monitor:$TAG"
}

phase_verify() {
  echo "==> Fase E3 · Verificación end-to-end (ver F8-preflight.md §Verificación)"
  echo "  /health/ready, home y /catalogo 200 · isRoomRegistered de las 50 · publicación de una ficha"
  echo "  con anclaje real · /api/public/rooms coherente · worker lag:0"
}

case "$PHASE" in
  plan)
    preflight
    echo; phase_backup
    echo; phase_contract
    echo; phase_reset
    echo; phase_seed
    echo; phase_build
    echo; phase_deploy
    echo; phase_verify
    echo
    echo "PLAN: nada ejecutado. Añade --execute y una --phase concreta."
    ;;
  backup|contract|reset|seed|build|deploy|verify)
    guard_execute
    "phase_${PHASE}"
    ;;
  all)
    guard_execute
    preflight; phase_backup; phase_contract; phase_build; phase_deploy; phase_verify
    echo
    echo "Recuerda: reset (fase C) y siembra (fase D) son pasos de job guiados; ejecútalos en orden."
    ;;
  *) echo "Fase desconocida: $PHASE" >&2; exit 2 ;;
esac
