# =============================================================================
# Script de Despliegue en Polygon Amoy (Testnet - chainId 80002) vía Foundry (PowerShell)
# TASK-00.5
# =============================================================================
$ErrorActionPreference = "Stop"

$RpcUrl = if ($env:AMOY_RPC_URL) { $env:AMOY_RPC_URL } else { "https://rpc-amoy.polygon.technology" }
$ChainId = if ($env:CHAIN_ID) { $env:CHAIN_ID } else { "80002" }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando despliegue en Polygon Amoy (chainId $ChainId)" -ForegroundColor Cyan
Write-Host "📡 RPC: $RpcUrl" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not $env:DEPLOYER_PRIVATE_KEY) {
    Write-Error "❌ Error: DEPLOYER_PRIVATE_KEY no está definida en las variables de entorno."
}

forge build

forge script script/Deploy.s.sol:Deploy `
    --rpc-url "$RpcUrl" `
    --broadcast `
    -vvvv

Write-Host "✅ Despliegue en Polygon Amoy completado." -ForegroundColor Green
