#!/usr/bin/env bash
#
# E2E del slice de reventa (FASE 2) sobre Anvil: mint → compra → listar → buyResale → claim.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC_URL="http://127.0.0.1:8545"
DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # acct0
ADMIN_ADDRESS="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"    # acct1 → 6 roles (incl. MINTER)
TREASURY_ADDRESS="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" # acct2

echo "▶ Compilando…"
forge build >/dev/null

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
    forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow >/dev/null

echo "▶ Ejecutando el slice de reventa…"
pnpm exec tsx scripts/e2e-slice-resale.ts
