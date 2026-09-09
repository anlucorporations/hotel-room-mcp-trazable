#!/usr/bin/env bash
# =============================================================================
# Script de Despliegue en Polygon Amoy (Testnet - chainId 80002) vía Foundry
# Para ejecución desde entorno local o instancia GCP (TASK-00.5)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

AMOY_RPC_URL="${AMOY_RPC_URL:-https://rpc-amoy.polygon.technology}"
CHAIN_ID="${CHAIN_ID:-80002}"

echo "========================================================"
echo "🚀 Iniciando despliegue en Polygon Amoy (chainId ${CHAIN_ID})"
echo "📡 RPC: ${AMOY_RPC_URL}"
echo "========================================================"

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "❌ Error: DEPLOYER_PRIVATE_KEY no está definida."
  exit 1
fi

cd "${ROOT_DIR}"

# Compilación previa
forge build

# Ejecución del script de despliegue con broadcast
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "${AMOY_RPC_URL}" \
  --broadcast \
  -vvvv

echo "✅ Despliegue en Polygon Amoy completado."
