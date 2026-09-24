# =============================================================================
# Despliegue del contrato canonico HotelNights en Polygon Amoy (testnet 80002)
# con Foundry, desde Windows/PowerShell.
#
# ESTADO: herramienta de ROADMAP. La red canonica del proyecto es Anvil local
# (decision D-01); este script existe para la fase publica en Polygon y hoy solo
# tiene sentido si se ha decidido ese salto (la decision D-11 deja el dictamen
# MiCA y fiscal como gate previo a cualquier despliegue publico).
#
# NOTA: este fichero se mantiene en ASCII puro a proposito. PowerShell 5.1 lee
# los .ps1 sin BOM como ANSI, de modo que los acentos y emojis en UTF-8 se
# decodifican como comillas tipograficas y rompen el analisis sintactico: el
# fichero anterior no se podia ni ejecutar.
#
# Uso:
#   $env:DEPLOYER_PRIVATE_KEY = "0x..."
#   $env:AMOY_RPC_URL = "https://rpc-amoy.polygon.technology"   # opcional
#   $env:ADMIN_ADDRESS = "0x..."       # opcional: gobernanza definitiva
#   $env:TREASURY_ADDRESS = "0x..."    # opcional: tesoreria del hotel
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/contracts/scripts/deploy-amoy.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

$RpcUrl = if ($env:AMOY_RPC_URL) { $env:AMOY_RPC_URL } else { "https://rpc-amoy.polygon.technology" }
$ChainId = if ($env:CHAIN_ID) { $env:CHAIN_ID } else { "80002" }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Despliegue de HotelNights en Polygon Amoy (chainId $ChainId)" -ForegroundColor Cyan
Write-Host "RPC: $RpcUrl" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not $env:DEPLOYER_PRIVATE_KEY) {
    Write-Error "DEPLOYER_PRIVATE_KEY no esta definida en las variables de entorno."
    exit 1
}

Write-Host "Compilando contratos..." -ForegroundColor Yellow
forge build
if ($LASTEXITCODE -ne 0) { Write-Error "forge build fallo."; exit 1 }

Write-Host "Desplegando HotelNights (roles operativos + faucet opcional)..." -ForegroundColor Yellow
forge script script/Deploy.s.sol:Deploy `
    --rpc-url "$RpcUrl" `
    --broadcast `
    -vvvv
if ($LASTEXITCODE -ne 0) { Write-Error "El despliegue fallo."; exit 1 }

Write-Host "Sincronizando el registro de despliegue a packages/shared..." -ForegroundColor Yellow
pnpm --filter @hotel/contracts sync

Write-Host "Despliegue completado. Revisa deployments/$ChainId.json y packages/shared/deployments/$ChainId.json" -ForegroundColor Green
