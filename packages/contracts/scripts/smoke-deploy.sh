#!/usr/bin/env bash
#
# Deploy de humo a Anvil (chainId 81234) con verificación del bootstrap de roles.
# DoD FASE 0: compila, despliega, `hasRole` correcto y EOA desplegador revocado.
# Solo para desarrollo/CI: usa cuentas del mnemónico por defecto de Anvil.
set -euo pipefail

cd "$(dirname "$0")/.."

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

# Cuentas del mnemónico por defecto de Anvil (NUNCA usar fuera de dev/CI).
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEPLOYER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" # cuenta #0
ADMIN_ADDRESS="${ADMIN_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"    # cuenta #1
# Clave del admin (cuenta #1 de Anvil) — solo para completar el 2.º paso de ownership en dev.
ADMIN_PRIVATE_KEY="${ADMIN_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
TREASURY_ADDRESS="${TREASURY_ADDRESS:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}" # cuenta #2
ROYALTY_BPS="${ROYALTY_BPS:-1000}"

echo "▶ Compilando contrato…"
forge build

echo "▶ Arrancando Anvil (chainId 81234)…"
anvil --chain-id 81234 --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
    if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then break; fi
    sleep 0.25
done

echo "▶ Desplegando con bootstrap de roles…"
DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
ADMIN_ADDRESS="$ADMIN_ADDRESS" \
TREASURY_ADDRESS="$TREASURY_ADDRESS" \
ROYALTY_BPS="$ROYALTY_BPS" \
    forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow

ADDR=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('./deployments/latest.json','utf8')).address)")
ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"
MINTER_ROLE=$(cast keccak "MINTER_ROLE")

echo "▶ Verificando bootstrap on-chain en ${ADDR}…"
has_role() {
    cast call "$ADDR" "hasRole(bytes32,address)(bool)" "$1" "$2" --rpc-url "$RPC_URL"
}

[ "$(has_role "$MINTER_ROLE" "$ADMIN_ADDRESS")" = "true" ] ||
    { echo "✗ El admin no tiene MINTER_ROLE"; exit 1; }
[ "$(has_role "$ADMIN_ROLE" "$ADMIN_ADDRESS")" = "true" ] ||
    { echo "✗ El admin no tiene DEFAULT_ADMIN_ROLE"; exit 1; }
[ "$(has_role "$ADMIN_ROLE" "$DEPLOYER_ADDRESS")" = "false" ] ||
    { echo "✗ El EOA desplegador NO fue revocado"; exit 1; }

echo "▶ Verificando transferencia de ownership (Ownable2Step, 2 pasos)…"
lower() { echo "$1" | tr "A-Z" "a-z"; }
PENDING=$(cast call "$ADDR" "pendingOwner()(address)" --rpc-url "$RPC_URL")
[ "$(lower "$PENDING")" = "$(lower "$ADMIN_ADDRESS")" ] ||
    { echo "✗ pendingOwner ($PENDING) != admin"; exit 1; }
# 2.º paso: el admin acepta la propiedad (en prod lo hace el Safe).
cast send "$ADDR" "acceptOwnership()" --private-key "$ADMIN_PRIVATE_KEY" --rpc-url "$RPC_URL" >/dev/null
OWNER=$(cast call "$ADDR" "owner()(address)" --rpc-url "$RPC_URL")
[ "$(lower "$OWNER")" = "$(lower "$ADMIN_ADDRESS")" ] ||
    { echo "✗ owner ($OWNER) != admin tras aceptar"; exit 1; }

echo "▶ Sincronizando registro a packages/shared…"
pnpm sync

echo "✅ Smoke deploy OK — roles correctos y EOA revocado."
