#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# F8 · Banco de pruebas REAL del barrido global multi-habitación (D-4/D-11/D-16/D-17).
#
# Levanta un Anvil DESECHABLE, despliega el contrato recién compilado y ejecuta
# `scripts/e2e/f8-mint-window.ts`: registra tres habitaciones, acuña su ventana,
# repite el barrido (idempotencia) e intenta el duplicado, y comprueba el aviso
# de agotamiento al ampliar la ventana. No toca GCP, ni PostgreSQL, ni Redis.
#
#   bash scripts/dev/f8-mint-window-sweep.sh
#   F8_WINDOW_PORT=8598 bash scripts/dev/f8-mint-window-sweep.sh
#
# Requiere: forge/anvil (se buscan también en ~/.foundry/bin), pnpm y node.
# ---------------------------------------------------------------------------
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PORT="${F8_WINDOW_PORT:-8598}"
RPC="http://127.0.0.1:${PORT}"
OWNER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"   # cuenta 0 de Anvil
OWNER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

export PATH="$HOME/.foundry/bin:$PATH"
for tool in anvil forge cast; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: falta $tool (¿foundryup?)" >&2; exit 1; }
done

ANVIL_PID=""
cleanup() {
  if [[ -n "$ANVIL_PID" ]]; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Anvil desechable en $RPC (chainId 31337)"
anvil --port "$PORT" --chain-id 31337 --silent &
ANVIL_PID=$!
for _ in $(seq 1 40); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 0.5
done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "ERROR: Anvil no respondió" >&2; exit 1; }

echo "==> Compilando el contrato y el paquete compartido"
forge build --root packages/contracts >/dev/null
pnpm --filter @hotel/shared build >/dev/null

echo "==> Desplegando HotelNights"
OUT="$(forge create src/HotelNights.sol:HotelNights --root packages/contracts \
  --rpc-url "$RPC" --private-key "$OWNER_KEY" --broadcast --constructor-args "$OWNER_ADDR" 2>&1)"
ADDR="$(printf '%s' "$OUT" | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')"
[[ -n "$ADDR" ]] || { echo "ERROR: no se pudo desplegar" >&2; echo "$OUT" >&2; exit 1; }
echo "    contrato: $ADDR"

echo "==> Banco de pruebas del barrido multi-habitación"
RPC_URL="$RPC" CHAIN_ID=31337 CONTRACT_ADDRESS="$ADDR" ADMIN_PRIVATE_KEY="$OWNER_KEY" \
  pnpm --filter @hotel/contracts exec tsx scripts/e2e/f8-mint-window.ts
