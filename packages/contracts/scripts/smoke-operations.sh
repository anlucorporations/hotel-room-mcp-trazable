#!/usr/bin/env bash
#
# Smoke de F2: despliega `HotelOperations` en Anvil (chainId 81234), verifica el bootstrap de roles
# y el respaldo `OWNER_BACKUP`, sincroniza el registro y ejecuta el E2E de relay firmado.
# Solo para desarrollo/CI: usa cuentas del mnemónico por defecto de Anvil.
set -euo pipefail

cd "$(dirname "$0")/.."

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
FORGE="${FORGE:-forge}"

# Cuentas del mnemónico por defecto de Anvil (NUNCA usar fuera de dev/CI).
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEPLOYER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"                            # #0
ADMIN_ADDRESS="${ADMIN_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"               # #1
HEAD_MAINTENANCE_ADDRESS="${HEAD_MAINTENANCE_ADDRESS:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}" # #2
HEAD_KEEPER_ADDRESS="${HEAD_KEEPER_ADDRESS:-0x90F79bf6EB2c4f870365E785982E1f101E93b906}"   # #3
OWNER_BACKUP_ADDRESS="${OWNER_BACKUP_ADDRESS:-0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65}" # #4

echo "▶ Compilando contratos…"
"$FORGE" build

echo "▶ Compilando @hotel/shared (los scripts consumen su dist, no las fuentes)…"
pnpm --filter @hotel/shared build >/dev/null

echo "▶ Arrancando Anvil (chainId 81234)…"
anvil --chain-id 81234 --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
    if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then break; fi
    sleep 0.25
done

echo "▶ Desplegando HotelOperations con bootstrap de roles…"
DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
OPERATIONS_ADMIN_ADDRESS="$ADMIN_ADDRESS" \
HEAD_MAINTENANCE_ADDRESS="$HEAD_MAINTENANCE_ADDRESS" \
HEAD_KEEPER_ADDRESS="$HEAD_KEEPER_ADDRESS" \
OWNER_BACKUP_ADDRESS="$OWNER_BACKUP_ADDRESS" \
OWNER_BACKUP_FOR_ROLE="HEAD_MAINTENANCE_ROLE" \
    "$FORGE" script script/DeployOperations.s.sol:DeployOperations --rpc-url "$RPC_URL" --broadcast --slow

ADDR=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('./deployments/latest-operations.json','utf8')).address)")
ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"
HEAD_MAINTENANCE_ROLE=$(cast keccak "HEAD_MAINTENANCE_ROLE")
HEAD_KEEPER_ROLE=$(cast keccak "HEAD_KEEPER_ROLE")

echo "▶ Verificando bootstrap on-chain en ${ADDR}…"
has_role() {
    cast call "$ADDR" "hasRole(bytes32,address)(bool)" "$1" "$2" --rpc-url "$RPC_URL"
}
[ "$(has_role "$HEAD_MAINTENANCE_ROLE" "$HEAD_MAINTENANCE_ADDRESS")" = "true" ] ||
    { echo "✗ El jefe de mantenimiento no tiene su rol"; exit 1; }
[ "$(has_role "$HEAD_KEEPER_ROLE" "$HEAD_KEEPER_ADDRESS")" = "true" ] ||
    { echo "✗ El ama de llaves no tiene su rol"; exit 1; }
[ "$(has_role "$ADMIN_ROLE" "$ADMIN_ADDRESS")" = "true" ] ||
    { echo "✗ El admin no tiene DEFAULT_ADMIN_ROLE"; exit 1; }
[ "$(has_role "$ADMIN_ROLE" "$DEPLOYER_ADDRESS")" = "false" ] ||
    { echo "✗ El EOA desplegador NO fue revocado"; exit 1; }
BACKUP=$(cast call "$ADDR" "backupForRole(bytes32)(address)" "$HEAD_MAINTENANCE_ROLE" --rpc-url "$RPC_URL")
[ "$(echo "$BACKUP" | tr 'A-Z' 'a-z')" = "$(echo "$OWNER_BACKUP_ADDRESS" | tr 'A-Z' 'a-z')" ] ||
    { echo "✗ backupForRole no es OWNER_BACKUP ($BACKUP)"; exit 1; }

echo "▶ Sincronizando registro a packages/shared…"
pnpm sync

echo "▶ E2E de relay firmado (relayer ≠ firmante)…"
RPC_URL="$RPC_URL" pnpm exec tsx scripts/e2e/f2-operations.ts

echo "▶ E2E del outbox de anclaje (F3: ciclo, recuperación y backoff)…"
RPC_URL="$RPC_URL" pnpm exec tsx ../../apps/worker/scripts/e2e/f3-anchor-outbox.ts

echo "✅ Smoke F2+F3 OK — roles, respaldo, relay firmado y outbox verificados."
