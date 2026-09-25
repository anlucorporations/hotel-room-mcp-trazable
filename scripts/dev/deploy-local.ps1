# =============================================================================
# Hotel Marina del Sol - despliegue local del sistema completo
#
#   pwsh scripts/dev/deploy-local.ps1            # arranca todo (build + servicios)
#   pwsh scripts/dev/deploy-local.ps1 -Status     # estado y salud de cada pieza
#   pwsh scripts/dev/deploy-local.ps1 -Stop       # para todo lo que arranco este script
#   pwsh scripts/dev/deploy-local.ps1 -SkipBuild  # arranca sin reconstruir
#
# Que levanta:  worker (8787) . MCP (MCP_PORT) . monitor . web (3000)
# Que NO levanta (dependencias del entorno, se comprueban):
#   PostgreSQL 5432 . Redis 6379 . Anvil 8545 (chainId 81234)
#
# Notas:
#   - Mantener este fichero en ASCII puro: PowerShell 5.1 lee los .ps1 sin BOM como ANSI y los
#     acentos rompen el analisis sintactico.
#   - Los servicios se lanzan como procesos independientes (no turbo watch) para que sobrevivan a
#     este script y se puedan parar con -Stop usando el fichero de PIDs.
# =============================================================================
param(
    [switch]$Stop,
    [switch]$Status,
    [switch]$SkipBuild,
    [switch]$NoSmtp
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$logDir = Join-Path $root '.deploy-logs'
$pidFile = Join-Path $logDir 'pids.json'
$envFile = Join-Path $root '.env'

function Read-DotEnv([string]$path) {
    $map = @{}
    foreach ($line in Get-Content $path) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $parts = $line.Split('=', 2)
        $map[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $map
}

$env2 = Read-DotEnv $envFile
$workerPort = if ($env2['WORKER_PORT']) { $env2['WORKER_PORT'] } else { '8787' }
$mcpPort = if ($env2['MCP_PORT']) { $env2['MCP_PORT'] } else { '8788' }
$webPort = '3000'

# CLI de pnpm resuelto explicitamente (el shim `pnpm.ps1` no se puede lanzar con Start-Process).
$pnpmCli = Join-Path $env:APPDATA 'npm\node_modules\pnpm\bin\pnpm.mjs'
if (-not (Test-Path $pnpmCli)) {
    $cmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($cmd) { $pnpmCli = (Resolve-Path (Join-Path (Split-Path $cmd.Source) 'node_modules\pnpm\bin\pnpm.mjs')).Path }
}
if (-not $pnpmCli -or -not (Test-Path $pnpmCli)) {
    Write-Host 'no se encuentra el CLI de pnpm (pnpm.mjs); ajusta $pnpmCli en este script' -ForegroundColor Red
    exit 1
}

$targets = @(
    @{ Name = 'worker'; Port = [int]$workerPort; Package = '@hotel/worker' },
    @{ Name = 'mcp'; Port = [int]$mcpPort; Package = '@hotel/mcp' },
    @{ Name = 'monitor'; Port = 0; Package = '@hotel/monitor' },
    @{ Name = 'web'; Port = [int]$webPort; Package = '@hotel/web' }
)

function Test-Port([int]$port) {
    if ($port -eq 0) { return $null }
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $conn) { return $null }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    return [pscustomobject]@{ Pid = $conn.OwningProcess; Process = $proc.ProcessName }
}

function Get-Health([int]$port, [string]$path = '/health') {
    if ($port -eq 0) { return $null }
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port$path" -TimeoutSec 8 -UseBasicParsing
        $body = $res.Content
        if ($body.Length -gt 160) { $body = $body.Substring(0, 160) }
        return "$($res.StatusCode) $body"
    } catch {
        $resp = $_.Exception.Response
        if ($resp) { return "HTTP $([int]$resp.StatusCode)" }
        return "sin respuesta"
    }
}

function Show-Status() {
    Write-Host ''
    Write-Host 'ESTADO DEL SISTEMA' -ForegroundColor Cyan
    Write-Host ('{0,-10} {1,-6} {2,-28} {3}' -f 'SERVICIO', 'PUERTO', 'PROCESO', 'SALUD')
    foreach ($t in $targets) {
        $listener = Test-Port $t.Port
        $procText = if ($listener) { "$($listener.Process) (PID $($listener.Pid))" } else { '-' }
        $portText = if ($t.Port -eq 0) { '-' } else { $t.Port }
        $health = if ($t.Name -eq 'web') { Get-Health $t.Port '/' } else { Get-Health $t.Port }
        # El monitor no abre puerto: se informa de si su proceso sigue vivo.
        if ($t.Port -eq 0) {
            $alive = $false
            if (Test-Path $pidFile) {
                $saved = Get-Content $pidFile -Raw | ConvertFrom-Json
                $entry = $saved | Where-Object { $_.name -eq $t.Name } | Select-Object -First 1
                if ($entry -and (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) {
                    $alive = $true
                    $procText = "node (PID $($entry.pid))"
                } else {
                    $procText = 'no arrancado por este script'
                }
            } else {
                $procText = 'no arrancado por este script'
            }
            $health = if ($alive) { 'activo (sondea y alerta, sin puerto)' } else { '-' }
        }
        Write-Host ('{0,-10} {1,-6} {2,-28} {3}' -f $t.Name, $portText, $procText, $health)
    }
    if (Test-Port 2525) {
        $sinkListener = Test-Port 2525
        Write-Host ('{0,-10} {1,-6} {2,-28} {3}' -f 'smtp-sink', 2525, "$($sinkListener.Process) (PID $($sinkListener.Pid))", 'entrega de correo en local')
    }
    Write-Host ''
    Write-Host 'DEPENDENCIAS' -ForegroundColor Cyan
    foreach ($dep in @(@{N='PostgreSQL';P=5432}, @{N='Redis';P=6379}, @{N='Anvil';P=8545})) {
        $l = Test-Port $dep.P
        $state = if ($l) { "OK ($($l.Process))" } else { 'NO DISPONIBLE' }
        Write-Host ('{0,-12} {1,-6} {2}' -f $dep.N, $dep.P, $state)
    }
    Write-Host ''
}

if ($Stop) {
    if (-not (Test-Path $pidFile)) { Write-Host 'no hay servicios registrados por este script'; exit 0 }
    $saved = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($entry in $saved) {
        $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $entry.pid -Force
            Write-Host "parado $($entry.name) (PID $($entry.pid))"
        } else {
            Write-Host "$($entry.name): ya no estaba en marcha"
        }
    }
    Remove-Item $pidFile -Force
    Show-Status
    exit 0
}

if ($Status) { Show-Status; exit 0 }

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# --- Comprobacion previa de dependencias -------------------------------------
$missing = @()
foreach ($dep in @(@{N='PostgreSQL';P=5432}, @{N='Redis';P=6379}, @{N='Anvil';P=8545})) {
    if (-not (Test-Port $dep.P)) { $missing += "$($dep.N) (puerto $($dep.P))" }
}
if ($missing.Count -gt 0) {
    Write-Host 'FALTAN DEPENDENCIAS: ' -ForegroundColor Red -NoNewline
    Write-Host ($missing -join ', ')
    Write-Host 'Arráncalas antes: PostgreSQL (servicio), scripts/dev/start-redis.ps1 y anvil --chain-id 81234'
    exit 1
}

# --- Sumidero SMTP local -----------------------------------------------------
# Sin proveedor de correo, el worker arranca DEGRADADO (`emailDegraded`: /health 503) y reintenta
# cada aviso hasta agotarlo, llenando el log. El sumidero entrega el correo de verdad por SMTP.
$smtpPort = 2525
$useLocalSmtp = -not $NoSmtp
$started = @()

if ($useLocalSmtp) {
    if (Test-Port $smtpPort) {
        Write-Host "sumidero SMTP: el puerto $smtpPort ya esta ocupado; se reutiliza" -ForegroundColor Yellow
    } else {
        $sinkOut = Join-Path $logDir 'smtp-sink.log'
        $sinkErr = Join-Path $logDir 'smtp-sink.err.log'
        $sink = Start-Process -FilePath 'node' -ArgumentList @('--experimental-strip-types', 'scripts/dev/smtp-sink.ts', "$smtpPort") `
            -WorkingDirectory $root -RedirectStandardOutput $sinkOut -RedirectStandardError $sinkErr -PassThru -WindowStyle Hidden
        Write-Host "arrancado sumidero SMTP (PID $($sink.Id)) -> $sinkOut"
        $started += [pscustomobject]@{ name = 'smtp-sink'; pid = $sink.Id; port = $smtpPort }
        Start-Sleep -Seconds 3
    }
}

# Fichero de entorno del despliegue: el `.env` con los ajustes de ESTE entorno (nunca se versiona).
# Se pasa a worker y monitor con `--env-file`: asi no dependen del cwd ni de variables heredadas.
$deployEnv = Join-Path $logDir 'env.deploy'
$override = @{}
if ($useLocalSmtp) {
    $override['SMTP_HOST'] = '127.0.0.1'
    $override['SMTP_PORT'] = "$smtpPort"
    $override['SMTP_USER'] = 'dev'
    $override['SMTP_PASS'] = 'dev'
}
# El monitor exige el formato "nombre=url"; el `.env` de ejemplo trae solo URLs.
$override['MONITOR_TARGETS'] = "worker=http://127.0.0.1:$workerPort/health,mcp=http://127.0.0.1:$mcpPort/health"

$envLines = @()
$seen = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { $envLines += $line; continue }
    $key = ($line.Split('=', 2)[0]).Trim()
    if ($override.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $envLines += $line
}
foreach ($key in $override.Keys) {
    if (-not $seen.ContainsKey($key)) { $envLines += "$key=$($override[$key])" }
}
Set-Content -Path $deployEnv -Value $envLines -Encoding UTF8
Write-Host "entorno del despliegue escrito en $deployEnv"

# --- Build -------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host 'Construyendo paquetes y aplicaciones...' -ForegroundColor Cyan
    # `-ErrorAction Continue` + comprobacion de exit code: Foundry escribe AVISOS del linter por
    # stderr, y con $ErrorActionPreference='Stop' PowerShell los trataba como fallo terminante y
    # abortaba el despliegue aunque el build estuviera en verde.
    $buildOutput = & pnpm build 2>&1
    $buildCode = $LASTEXITCODE
    if ($buildCode -ne 0) {
        Write-Host 'la construccion fallo:' -ForegroundColor Red
        $buildOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    $buildOutput | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" }
}

# --- Arranque ----------------------------------------------------------------
foreach ($t in $targets) {
    $existing = Test-Port $t.Port
    if ($existing -and $t.Port -ne 0) {
        Write-Host "$($t.Name): el puerto $($t.Port) ya esta ocupado por $($existing.Process) (PID $($existing.Pid)); se omite" -ForegroundColor Yellow
        continue
    }

    $out = Join-Path $logDir "$($t.Name).log"
    $err = Join-Path $logDir "$($t.Name).err.log"

    # Se arranca el proceso REAL (node o next), no `pnpm start`: con pnpm habia un proceso
    # intermedio y el PID registrado no era el que escuchaba en el puerto, de modo que `-Stop`
    # dejaba al listener huerfano (paso de verdad al reiniciar la plataforma).
    $command = if ($t.Name -eq 'web') {
        # `apps/web/node_modules/.bin/next` es el shim POSIX (no lo puede ejecutar Node) y el paquete
        # `next` NO esta hoisteado en la raiz de este monorepo. Se resuelve la ruta REAL ejecutando
        # `next --version` en el contexto de la app y se arranca con node.
        $resolved = & cmd /c "cd /d ""$root\apps\web"" && node -e ""console.log(require.resolve('next/dist/bin/next'))""" 2>$null
        if (-not $resolved -or -not (Test-Path $resolved)) {
            Write-Host 'web: no se pudo resolver el binario de next (ejecuta pnpm install)' -ForegroundColor Yellow
            continue
        }
        @($resolved.Trim(), 'start', '-p', "$webPort")
    } else {
        $entry = Join-Path $root "apps\$($t.Name)\dist\main.js"
        if (-not (Test-Path $entry)) {
            Write-Host "$($t.Name): falta $entry (ejecuta sin -SkipBuild)" -ForegroundColor Yellow
            continue
        }
        # El entorno del despliegue se inyecta con `--env-file` de Node: asi el proceso no depende
        # del directorio de trabajo ni de variables heredadas.
        @('--env-file', $deployEnv, $entry)
    }

    # Directorio de trabajo: la web DEBE arrancar desde `apps/web` (Next busca el build en su
    # `.next` local); los servicios de fondo, desde la raiz para resolver el workspace.
    $workDir = if ($t.Name -eq 'web') { Join-Path $root 'apps\web' } else { $root }
    $proc = Start-Process -FilePath 'node' -ArgumentList $command -WorkingDirectory $workDir `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
    Write-Host "arrancado $($t.Name) (PID $($proc.Id)) -> $out"
    $started += [pscustomobject]@{ name = $t.Name; pid = $proc.Id; port = $t.Port }
}

$started | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

# --- Espera a que respondan --------------------------------------------------
Write-Host ''
Write-Host 'Esperando a que los servicios respondan...' -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(120)
foreach ($t in $targets) {
    if ($t.Port -eq 0) { continue }
    $up = $false
    while (-not $up -and (Get-Date) -lt $deadline) {
        $health = if ($t.Name -eq 'web') { Get-Health $t.Port '/' } else { Get-Health $t.Port }
        if ($health -and $health -notmatch 'sin respuesta|^HTTP 5') { $up = $true } else { Start-Sleep -Seconds 3 }
    }
    if ($up) { Write-Host "$($t.Name): responde" -ForegroundColor Green }
    else { Write-Host "$($t.Name): NO responde todavia (mira $logDir\$($t.Name).err.log)" -ForegroundColor Yellow }
}

Show-Status
Write-Host "Web:      http://127.0.0.1:$webPort"
Write-Host "Worker:   http://127.0.0.1:$workerPort/health"
Write-Host "MCP:      http://127.0.0.1:$mcpPort/health"
Write-Host "Logs:     $logDir"
Write-Host "Parar:    pwsh scripts/dev/deploy-local.ps1 -Stop"
