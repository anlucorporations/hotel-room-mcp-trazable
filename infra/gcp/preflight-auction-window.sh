#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Preflight (SOLO LECTURA) de la ventana de redeploy de C2 · RF-13 (subastas).
#
# No despliega, no firma y no modifica nada: comprueba el estado de la red y del registro y dice si
# la ventana debe desplegar `HotelNights` (con el gancho `AUCTION_ROLE` + `settleAuction`) y
# `NightAuction`, o solo la subasta. Imprime el plan y el rollback para revisarlos antes de ejecutar.
#
#   bash infra/gcp/preflight-auction-window.sh                 # red de gcp-env.sh (Besu 81234)
#   GCP_CHAIN_RPC_URL=http://127.0.0.1:8545 bash ...            # contra un Anvil local
#
# Requiere `cast` (Foundry) y `gcloud` (solo para las revisiones en Cloud Run).
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

REPO_ROOT="$(cd "$HERE/../.." && pwd)"
RPC="${GCP_CHAIN_RPC_URL}"
CHAIN_ID="${GCP_CHAIN_ID}"
DEP_FILE="${GCP_DEPLOYMENT_FILE}"
AUCTION_FILE="$REPO_ROOT/packages/contracts/deployments/${CHAIN_ID}-auction.json"
CAST="${CAST:-cast}"

say() { printf '%s\n' "$*"; }
check() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; }

say "== Preflight · ventana de redeploy de C2 (subasta primaria, RF-13) =="
say "Red:      $RPC (chainId esperado $CHAIN_ID)"
say "Registro: $DEP_FILE"
say ""

# ── 1. La red responde y es la esperada ─────────────────────────────────────
say "1. Red"
if ! ACTUAL_CHAIN_ID="$("$CAST" chain-id --rpc-url "$RPC" 2>/dev/null)"; then
  bad "el RPC no responde; no se puede preflightar la ventana"
  exit 1
fi
if [[ "$ACTUAL_CHAIN_ID" == "$CHAIN_ID" ]]; then
  check "chainId $ACTUAL_CHAIN_ID coincide con la configuración"
else
  bad "el RPC responde chainId $ACTUAL_CHAIN_ID y la configuración espera $CHAIN_ID"
  exit 1
fi

# ── 2. Contrato de noches desplegado: ¿tiene ya el gancho de liquidación? ────
say ""
say "2. Contrato de noches (inventario y venta primaria)"
if [[ ! -f "$DEP_FILE" ]]; then
  bad "no existe el registro $DEP_FILE (¿contrato sin desplegar?)"
  exit 1
fi
NIGHTS="$(node -e "console.log(require('${DEP_FILE}').address)")"
BLOCK="$(node -e "console.log(require('${DEP_FILE}').deploymentBlock)")"
CODE="$("$CAST" code "$NIGHTS" --rpc-url "$RPC" 2>/dev/null || true)"
if [[ "${#CODE}" -gt 4 && "$CODE" != "0x" ]]; then
  check "HotelNights en $NIGHTS (bloque $BLOCK) con código desplegado"
else
  bad "no hay código en $NIGHTS"
  exit 1
fi

HOOK="no"
if "$CAST" call "$NIGHTS" "AUCTION_ROLE()(bytes32)" --rpc-url "$RPC" >/dev/null 2>&1; then
  HOOK="si"
  check "el contrato desplegado YA tiene \`AUCTION_ROLE\` (gancho de liquidación)"
  OWNER="$("$CAST" call "$NIGHTS" "owner()(address)" --rpc-url "$RPC")"
  if [[ "$("$CAST" call "$NIGHTS" "hasRole(bytes32,address)(bool)" "$("$CAST" keccak AUCTION_ROLE)" "$OWNER" --rpc-url "$RPC")" == "true" ]]; then
    warn "el owner ya tiene \`AUCTION_ROLE\`: solo debería tenerlo el contrato de subastas"
  else
    check "el owner no tiene \`AUCTION_ROLE\` (correcto: el rol es del contrato)"
  fi
else
  warn "el contrato desplegado NO tiene \`AUCTION_ROLE\`: es la versión anterior (C1)"
  warn "⇒ la ventana debe desplegar un HotelNights NUEVO (ADR-28) y re-sembrar"
fi

# ── 3. Subasta: ¿desplegada? ────────────────────────────────────────────────
say ""
say "3. Contrato de subastas"
if [[ -f "$AUCTION_FILE" ]]; then
  AUCTION="$(node -e "console.log(require('${AUCTION_FILE}').address)")"
  AUCTION_BLOCK="$(node -e "console.log(require('${AUCTION_FILE}').deploymentBlock ?? 0)")"
  AUCTION_CODE="$("$CAST" code "$AUCTION" --rpc-url "$RPC" 2>/dev/null || true)"
  if [[ "${#AUCTION_CODE}" -gt 4 && "$AUCTION_CODE" != "0x" ]]; then
    check "NightAuction en $AUCTION (bloque $AUCTION_BLOCK)"
    HOTEL_OF_AUCTION="$("$CAST" call "$AUCTION" "hotel()(address)" --rpc-url "$RPC" 2>/dev/null || true)"
    if [[ -z "$HOTEL_OF_AUCTION" ]]; then
      warn "no se pudo leer hotel() de la subasta"
    elif [[ "$HOTEL_OF_AUCTION" == "$NIGHTS" ]]; then
      check "la subasta apunta al HotelNights vigente"
    else
      warn "la subasta apunta a otro HotelNights ($HOTEL_OF_AUCTION): se re-desplegará en la ventana"
    fi
    if [[ "$HOOK" == "si" ]] && [[ "$("$CAST" call "$NIGHTS" "hasRole(bytes32,address)(bool)" "$("$CAST" keccak AUCTION_ROLE)" "$AUCTION" --rpc-url "$RPC")" == "true" ]]; then
      check "el contrato de subastas tiene \`AUCTION_ROLE\`"
    else
      warn "la subasta NO tiene \`AUCTION_ROLE\` (o el gancho no existe): hay que desplegar ambos"
    fi
  else
    warn "el registro apunta a $AUCTION pero no hay código en esa dirección"
  fi
else
  warn "no hay registro de subasta para chainId $CHAIN_ID: la vista /subastas está «no configurada»"
fi

# ── 4. Imágenes que sirven hoy (para el rollback) ───────────────────────────
say ""
say "4. Servicios en Cloud Run (rollback)"
if command -v gcloud >/dev/null 2>&1; then
  for svc in hotel-mcp-web hotel-mcp-mcp hotel-mcp-worker; do
    LINE="$(gcloud run services describe "$svc" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
      --format="value(spec.template.spec.containers[0].image,status.latestReadyRevisionName)" 2>/dev/null || true)"
    if [[ -n "$LINE" ]]; then
      check "$svc → $LINE"
    else
      warn "$svc no disponible (¿otra cuenta/permiso?)"
    fi
  done
else
  warn "gcloud no disponible: revisa las revisiones a mano antes de la ventana"
fi

# ── 5. Plan y rollback ──────────────────────────────────────────────────────
say ""
say "5. Plan de la ventana (docs/RUNBOOK.md §1.5.3)"
if [[ "$HOOK" == "si" ]]; then
  say "  a) Solo subasta: DeployAuction.s.sol + sync + rebuild web"
else
  say "  a) HotelNights nuevo: Deploy.s.sol + sync (con el gancho AUCTION_ROLE/settleAuction)"
  say "  b) NightAuction: DeployAuction.s.sol + sync (concede AUCTION_ROLE al contrato)"
  say "  c) Re-siembra del catálogo (si se decide) e imágenes nuevas de web (y mcp si cambia el ABI)"
  say "  d) Canario sin tráfico → verificación → promoción"
fi
say ""
say "Rollback:"
say "  · Contratos: volver a apuntar el registro al HotelNights anterior ($NIGHTS, bloque $BLOCK) y"
say "    reconstruir la web; las revisiones de Cloud Run anteriores quedan como rollback inmediato."
say "  · Web: gcloud run services update-traffic hotel-mcp-web --region=$GCP_REGION --to-revisions=<anterior>=100"
say ""
if [[ "$HOOK" == "si" ]]; then
  say "== RESULTADO: la ventana solo necesita desplegar la subasta. =="
else
  say "== RESULTADO: la ventana necesita HotelNights nuevo + subasta (riesgo alto: re-siembra). =="
fi
