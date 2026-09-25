# 03 · Operación diaria

> **Objetivo**: arrancar, parar y vigilar el sistema sin improvisar, y saber qué mirar cuando algo va mal.
> **Puertos**: web **3000**, worker **8787**, MCP **8790** (el 8788 puede estar ocupado por otro
> servicio de la máquina; el puerto se lee de `MCP_PORT`), PostgreSQL **5432**, Redis **6379**,
> Anvil **8545**.
> **Detalle de incidentes**: [03 · Incidentes](03-incidentes.md).

## 0. Camino rápido: un comando levanta el sistema entero

Para el día a día hay un script que arranca y comprueba todo, y que además resuelve las dos cosas que
dejan al sistema «en pie pero degradado»: el correo y los targets del monitor.

```powershell
pwsh scripts/dev/deploy-local.ps1              # construye y arranca todo (worker, MCP, monitor, web)
pwsh scripts/dev/deploy-local.ps1 -Status      # estado y salud de cada pieza (no arranca nada)
pwsh scripts/dev/deploy-local.ps1 -Stop        # para lo que arrancó el script
pwsh scripts/dev/deploy-local.ps1 -SkipBuild   # arranca sin reconstruir
pwsh scripts/dev/deploy-local.ps1 -NoSmtp      # sin sumidero de correo (el worker quedará degradado)
```

Qué hace, y por qué:

1. **Comprueba las dependencias** (PostgreSQL, Redis y Anvil) y **se niega a seguir** si falta alguna,
   en lugar de arrancar un sistema a medias.
2. **Levanta un sumidero SMTP local** (`scripts/dev/smtp-sink.ts`, puerto **2525**): sin proveedor de
   correo el worker arranca con `emailDegraded: true`, `/health` responde **503** y reintenta cada aviso
   hasta agotarlo. Con el sumidero el correo **se entrega de verdad** por SMTP y la salud recupera.
3. **Escribe `.deploy-logs/env.deploy`** (el `.env` con los ajustes de este entorno) y se lo pasa a
   worker y monitor con `--env-file`. Incluye `MONITOR_TARGETS` en el formato `nombre=url` que el
   monitor exige, que la plantilla del repositorio no trae.
4. **Arranca los cuatro servicios** como procesos independientes (sobreviven al script) y **espera a
   que respondan**.
5. **Deja los logs** en `.deploy-logs/<servicio>.log` (y `.err.log`).

> Los procesos se lanzan con `node` + el CLI de pnpm: `Start-Process` no puede ejecutar el shim
> `pnpm.ps1` (falla con «no es una aplicación Win32 válida»).

Diagnóstico de la cadena web → MCP (usa el mismo cliente y transporte que el asistente):

```powershell
cd apps/web
node --experimental-strip-types ../../scripts/dev/check-mcp-connection.ts http://127.0.0.1:8790/mcp
```

Diagnóstico del acceso al back-office (login + TOTP + métricas, y que sin token responda 401):

```powershell
cd packages/shared
node --env-file=../../.env --import tsx scripts/check-admin-login.ts <contraseña> <semillaTOTP> http://127.0.0.1:3000
```

Migración de la traza de sesiones a pseudonimizada (idempotente; sin `--apply` solo informa):

```powershell
pnpm --filter @hotel/shared backfill:session-traces -- --apply
```

## 1. Orden recomendado de arranque (manual)

Siempre **infraestructura → worker → web → MCP → monitor**. El worker necesita PostgreSQL, Redis y el
contrato desplegado; la web necesita el worker para los agregados; el monitor necesita a los demás.

1. **PostgreSQL**. Como servicio de Windows debe estar en marcha:

   ```powershell
   Get-Service postgresql-x64-18
   ```

2. **Redis-compatible** (Memurai extraído, sin servicio instalado):

   ```powershell
   pwsh scripts/dev/start-redis.ps1
   & "$env:USERPROFILE\memurai\Memurai\memurai-cli.exe" ping
   ```

3. **Anvil**, la red canónica:

   ```powershell
   anvil --chain-id 81234 --block-time 2
   cast chain-id --rpc-url http://127.0.0.1:8545
   ```

4. **Worker** (aplica migraciones, arranca listener, cola, planificador y HTTP):

   ```powershell
   pnpm --filter @hotel/worker dev
   ```

5. **Web**:

   ```powershell
   pnpm --filter @hotel/web dev
   ```

6. **MCP**:

   ```powershell
   pnpm --filter @hotel/mcp dev
   ```

7. **Monitor**:

   ```powershell
   pnpm --filter @hotel/monitor dev
   ```

## 2. Parada

1. Para primero los **servicios de aplicación** (`Ctrl+C` en cada terminal) y deja para el final la
   infraestructura.
2. Redis:

   ```powershell
   pwsh scripts/dev/start-redis.ps1 -Stop
   ```

3. Anvil: `Ctrl+C` en su terminal. **Reiniciar Anvil borra el estado de la cadena** (el contrato
   conserva la dirección determinista, pero no su contenido): exigirá **redesplegar** y resincronizar
   el registro. Procedimiento: [01 · Despliegue y redespliegue](01-despliegue-y-redespliegue.md).

> **Antes de ejecutar los E2E locales, para el worker.** Indexa el mismo contrato y reescribe las
> filas que los guiones afirman (el E2E de M5 falla con «El índice off-chain queda en CHECKED_IN»
> si el worker está vivo). Es un prerrequisito del entorno local, no del pipeline.

## 3. Comprobaciones de salud

| Qué | Endpoint / comando | Qué debe responder |
|---|---|---|
| Web viva | `curl.exe http://127.0.0.1:3000/health/live` | 200 |
| Web **lista** | `curl.exe http://127.0.0.1:3000/health/ready` | **200** `READY` con `postgres`, `redis`, `polygonRPC` en `UP`; **503** `DEGRADED` si algo falta |
| Worker | `curl.exe http://127.0.0.1:8787/health` | `{"status":"ok", …}` con `lag`, `aggregateLag`, `emailDegraded` |
| Agregados (fuente única del dashboard) | `curl.exe http://127.0.0.1:8787/aggregates` | 7 KPIs, serie mensual, desglose por tipo, ranking, `undatedSalesCount`, `timeZone` |
| Histórico | `curl.exe http://127.0.0.1:8787/history` | Lista de ventas con `tx_hash`, precio, tipo y comprador |
| MCP | `curl.exe http://127.0.0.1:8788/health` | 200 |
| Cadena | `cast block-number --rpc-url http://127.0.0.1:8545` | Un número que **crece** cada pocos segundos |
| Contrato | `cast code <address> --rpc-url http://127.0.0.1:8545` | Código distinto de `0x` |

Cómo leer el `/health` del worker:

| Campo | Significado | Valor sano |
|---|---|---|
| `lag` | `headBlock − lastBlock` del pipeline de correo/índice | Cerca de **0**; **negativo = avería** (checkpoint por delante de la cabeza) |
| `aggregateLag` | `headBlock − aggregateLastBlock` | Cerca de 0 |
| `emailDegraded` | La entrega de correo está degradada | `false`; `true` es esperado mientras `SMTP_PASS` esté vacío |
| `status` | `ok` / `down` | `down` si el RPC falla repetidamente, si el lag supera el umbral, si el correo está degradado o si el `catchUp` de agregados falla 3 veces seguidas |

> **Deuda declarada**: el HTTP del worker **no exige autenticación** y su CORS es `*`
> (`Access-Control-Allow-Origin: *`). Antes de exponerlo fuera de la máquina, ciérralo o ponlo detrás
> de la capa de red/WAF (D-11, [`docs/CLOUDFLARE-WAF-SETUP.md`](../../../docs/CLOUDFLARE-WAF-SETUP.md)).

## 4. Cuando algo va mal: síntoma → causa → comprobación → acción

| Síntoma | Causa probable | Comprobación | Acción |
|---|---|---|---|
| `/health/ready` → 503 con `postgres: DOWN` | PostgreSQL parado o `DATABASE_URL` mal | `Get-Service postgresql-x64-18`; `psql "$env:DATABASE_URL" -c "\dt"` | Arranca el servicio; corrige `.env` |
| `/health/ready` → 503 con `redis: DOWN` | Redis parado | `memurai-cli ping` | `pwsh scripts/dev/start-redis.ps1` |
| `/health/ready` → 503 con `polygonRPC: DOWN` | Anvil parado | `cast chain-id --rpc-url http://127.0.0.1:8545` | Arranca Anvil; si se reinició, **redespliega** |
| `/health` con `lag` **negativo** | La cadena se reinició o se desplegó otra vez y el checkpoint sobrevive | Compara `lastBlock` con `cast block-number` | No borres nada: el worker **rebobina** al bloque de despliegue y degrada la salud. Comprueba `/aggregates` |
| `/aggregates` todo a cero con noches reales en la cadena | Índice desincronizado o base restaurada de otra cadena | `cast call … ownerOf`; revisa el checkpoint | Reinicia el worker para que rebobine y reindexe desde el bloque de despliegue |
| `emailDegraded: true` de forma persistente | Sin proveedor SMTP o SMTP caído | `SELECT status, count(*) FROM email_notifications GROUP BY status;` | Rellena `SMTP_PASS`; la **reconciliación** reencola lo atascado |
| Correo en `FAILED` | Agotó los reintentos | Igual que arriba, filtrando `status='FAILED'` | Revisa el proveedor; el worker **avisa a DevOps** al agotar intentos |
| `timeout exceeded when trying to connect` en la web | Pool de PostgreSQL agotado | Logs del SSR; `DATABASE_POOL_MAX` | Sube el pool, cachea el catálogo o pon CDN. **Deuda medida**: 31 % de *timeouts* a 200 concurrentes |
| Compra rechazada con **503 `CONTRATO_EN_PAUSA`** | El contrato está en pausa | `cast call <addr> "paused()(bool)"` | Es una acción deliberada del propietario, no una avería: reanuda desde `/admin/pausa` |
| Segundo escaneo del mismo resguardo → **409 `TICKET_YA_USADO`** | El `jti` ya se consumió (uso único, correcto) | Estado del token: `isCheckedIn` | Si el huésped necesita un pase nuevo, emítelo desde su wallet; **no** reutilices el anterior |
| Dos puestos a la vez → **409 `CHECKIN_EN_PROCESO`** | Cerrojo por noche ocupado (TTL 15 s) | Reintenta a los pocos segundos | Reintenta; si persiste, revisa salud del RPC |
| Check-in → **503 `TITULARIDAD_NO_VERIFICABLE`** | RPC caído al leer `ownerOf` | `cast block-number` | Restaura el RPC; no marques el check-in «a mano» |
| Quema que **no quema** nada | Sin `BURNER_ROLE`, saldo insuficiente o ninguna noche caducada | `/health`, saldo de la hot-wallet | Recarga gas; revisa `skippedTokens` en el log del ciclo |
| Alertas de gas | Saldo bajo del umbral | `cast balance <wallet>`; `GAS_WALLETS` / `MIN_GAS_NATIVE` | Recarga la wallet y confirma que el monitor rearma el aviso |
| Alerta de **silencio de cadena** | Sin bloques nuevos en `SILENCE_THRESHOLD_MS` (10 min) | `cast block-number` dos veces | Revisa Anvil/RPC; la alerta se emite **una vez por episodio** y se rearma al volver un bloque |

## 5. Rutinas

### 5.1 Rotar operadores

1. Rota el operador (crea o **actualiza**) y entrega el `otpauth://` y los códigos de rescate, que se
   muestran **una sola vez**:

   ```powershell
   pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es
   pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
   ```

2. Confirma que el operador anterior ya no entra y que el nuevo completa contraseña + TOTP.
3. Rota también cuando un entorno se comparte: toda contraseña o semilla que se haya impreso en una
   consola de sesión debe rotarse.

### 5.2 Revisar el saldo de gas

1. Consulta el saldo de las wallets operativas (quema y recepción):

   ```powershell
   cast balance <BURNER_ADDRESS> --rpc-url http://127.0.0.1:8545
   cast balance <RECEPTION_ADDRESS> --rpc-url http://127.0.0.1:8545
   ```

2. Contrasta con los umbrales: `BURNER_MIN_BALANCE_NATIVE` (worker) y `MIN_GAS_NATIVE` (monitor).
3. Recarga con `cast send` desde una cuenta con fondos y confirma que el monitor vuelve a avisar si
   el saldo cae de nuevo (avisa **al entrar en fallo**, no en cada ciclo).

### 5.3 Revisar la cola de correo

1. Estado de la cola persistente:

   ```powershell
   psql "$env:DATABASE_URL" -c "SELECT status, count(*) FROM email_notifications GROUP BY status ORDER BY status;"
   ```

2. Una fila `PENDING` antigua significa que la reconciliación no la ha recuperado: revisa el SMTP y
   `EMAIL_RECONCILE_INTERVAL_MS`.
3. Las filas `SENT` se purgan a los 90 días, pero **no hay planificador** que lo haga: ejecuta
   `purgeOldNotifications` o prográmalo (deuda declarada).

### 5.4 Revisar la salud de los datos

1. Confirma que no hay ventas fuera de la serie mensual:

   ```powershell
   curl.exe http://127.0.0.1:8787/aggregates
   ```

   `undatedSalesCount` debe valer **0** tras el relleno de fechas.

2. Compara el histórico servido (`/history`) con los agregados: deben cuadrar. Es el criterio de
   aceptación del dashboard (ADR-25).

3. Comprueba el estado de la cadena y del contrato cuando haya dudas: cuando el índice y la cadena
   discrepan, **manda la cadena**.

---

*Siguiente: [Despliegue y redespliegue](01-despliegue-y-redespliegue.md) · [Incidentes](03-incidentes.md)*
