# =============================================================================
# start-redis.ps1 -- arranca un servidor Redis-compatible para desarrollo
#
# Contexto: en Windows sin Docker, el paquete `Redis.Redis` de winget es la
# version 3.0.504 y BullMQ 6 exige minimo 5.0.0 (recomendado 6.2.0), asi que no
# sirve. Este script usa Memurai Developer (compatible con Redis 7.x), extraido
# del MSI oficial con `msiexec /a` porque el instalador falla en su propia
# comprobacion de puerto (`ca_SilentCheckIfPortIsAvailable`) en esta maquina.
#
# NOTA: este fichero se mantiene en ASCII puro a proposito. PowerShell 5.1 lee
# los .ps1 sin BOM como ANSI, y los acentos o guiones largos en UTF-8 se
# decodifican como comillas tipograficas, lo que rompe el analisis sintactico.
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-redis.ps1
#       powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-redis.ps1 -Stop
#
# Variables:
#   MEMURAI_HOME  carpeta que contiene Memurai\memurai.exe
#                 (por defecto <perfil de usuario>\memurai)
# =============================================================================

[CmdletBinding()]
param(
  [switch]$Stop,
  [int]$Port = 6379,
  [string]$MemuraiHome = $(if ($env:MEMURAI_HOME) { $env:MEMURAI_HOME } else { Join-Path $env:USERPROFILE 'memurai' })
)

$exe = Join-Path $MemuraiHome 'Memurai\memurai.exe'
$cli = Join-Path $MemuraiHome 'Memurai\memurai-cli.exe'
$data = Join-Path $MemuraiHome 'data'

function Test-Port {
  param([int]$P)
  return [bool](Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
}

if ($Stop) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conn) {
    Write-Host "No hay nada escuchando en el puerto $Port."
    exit 0
  }
  foreach ($c in $conn) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match 'memurai|redis') {
      Stop-Process -Id $proc.Id -Force
      Write-Host "Detenido $($proc.ProcessName) (PID $($proc.Id))."
    }
  }
  exit 0
}

if (Test-Port -P $Port) {
  Write-Host "El puerto $Port ya esta escuchando; no se arranca otro servidor."
  & $cli -h 127.0.0.1 -p $Port ping
  exit 0
}

if (-not (Test-Path $exe)) {
  Write-Error ("No se encuentra {0}. Ajusta MEMURAI_HOME o extrae el MSI con: msiexec /a <memurai>.msi /qn TARGETDIR=<carpeta>" -f $exe)
  exit 1
}

New-Item -ItemType Directory -Path $data -Force | Out-Null

Start-Process -FilePath $exe -WindowStyle Hidden -ArgumentList @(
  '--port', $Port,
  '--bind', '127.0.0.1',
  '--dir', $data,
  '--maxmemory', '256mb',
  '--maxmemory-policy', 'noeviction',
  '--appendonly', 'yes'
)

Start-Sleep -Seconds 3

if (Test-Port -P $Port) {
  $version = (& $cli -h 127.0.0.1 -p $Port info server 2>$null | Select-String 'redis_version').Line
  Write-Host "Redis-compatible escuchando en 127.0.0.1:$Port -- $($version.Trim())"
} else {
  Write-Error "El servidor no respondio en el puerto $Port."
  exit 1
}
