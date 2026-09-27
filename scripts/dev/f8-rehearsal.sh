#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# F8 · Ensayo local del corte de contrato (NO toca GCP ni el registro real).
#
# Levanta un Anvil DESECHABLE, despliega el contrato recién compilado, ejecuta
# `inject-data --skip-db` (siembra el maestro en `rooms` + registra las 50
# habitaciones + mintea) y comprueba el resultado. Sirve de evidencia previa al
# corte global.
#
#   bash scripts/dev/f8-rehearsal.sh
#   F8_REHEARSAL_PORT=8601 bash scripts/dev/f8-rehearsal.sh
#
# Requiere: forge/anvil/cast (se buscan también en ~/.foundry/bin) y pnpm.
# ---------------------------------------------------------------------------
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PORT="${F8_REHEARSAL_PORT:-8599}"
RPC="http://127.0.0.1:${PORT}"
OWNER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
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

echo "==> Compilando el contrato"
forge build --root packages/contracts >/dev/null

echo "==> Desplegando HotelNights"
OUT="$(forge create src/HotelNights.sol:HotelNights --root packages/contracts \
  --rpc-url "$RPC" --private-key "$OWNER_KEY" --broadcast --constructor-args "$OWNER_ADDR" 2>&1)"
ADDR="$(printf '%s' "$OUT" | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')"
[[ -n "$ADDR" ]] || { echo "ERROR: no se pudo desplegar" >&2; echo "$OUT" >&2; exit 1; }
echo "    contrato: $ADDR"

echo "==> inject-data --skip-db (siembra + registerRoom + minteo)"
RPC_URL="$RPC" CHAIN_ID=31337 CONTRACT_ADDRESS="$ADDR" \
  pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --skip-db >/tmp/f8-rehearsal.log 2>&1 \
  || { echo "ERROR: inject-data falló; log en /tmp/f8-rehearsal.log" >&2; tail -20 /tmp/f8-rehearsal.log >&2; exit 1; }
grep -E "registrada|total|minteada|revendida" /tmp/f8-rehearsal.log | tail -6

echo "==> Comprobaciones on-chain"
fail=0
check() { # descripción, esperado, real
  if [[ "$2" == "$3" ]]; then echo "  ✓ $1"; else echo "  ✗ $1 (esperado '$2', real '$3')"; fail=1; fi
}
check "isRoomRegistered(101)" "true"  "$(cast call "$ADDR" 'isRoomRegistered(uint256)(bool)' 101 --rpc-url "$RPC")"
check "isRoomRegistered(220)" "true"  "$(cast call "$ADDR" 'isRoomRegistered(uint256)(bool)' 220 --rpc-url "$RPC")"
check "roomTypeOf(116)"       '"doble"' "$(cast call "$ADDR" 'roomTypeOf(uint256)(string)' 116 --rpc-url "$RPC")"
check "roomTypeOf(201)"       '"suite"' "$(cast call "$ADDR" 'roomTypeOf(uint256)(string)' 201 --rpc-url "$RPC")"

MINTED="$(cast logs --from-block 0 --address "$ADDR" 'Mint(uint256,uint256,uint256,string,uint256)' --rpc-url "$RPC" 2>/dev/null | grep -c 'data:')"
check "eventos Mint" "6" "$MINTED"

if [[ "$fail" == "1" ]]; then
  echo "ENSAYO FALLIDO" >&2
  exit 1
fi
echo
echo "✅ Ensayo F8 OK: contrato, registro de las 50 habitaciones y minteo funcionan en local."
