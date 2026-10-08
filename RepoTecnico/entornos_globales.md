# Entornos globales — Hotel Marina del Sol

> **Fase**: 1 (Concepto) · **Fecha**: 2026-09-21
> **Decisión de red vigente**: Anvil local (`D-01`) · **Infraestructura de desarrollo**: PostgreSQL 18 local + Redis nativo (`D-10`)

---

## 1. Repositorios y rama

> **Regla vigente (2026-10-07)**: en la línea de trabajo de la **v3** (asistente IA y manuales del
> huésped) el `push` va **solo a la rama `Hotel-DSH-GCP-v3`**. `main` y `Hotel-DSH-GCP` no se mueven.
>
> **Regla anterior (2026-09-25)**: solo se sube el proyecto a los **repositorios de `anlucorporations`**
> y **a la rama `Hotel-DSH-GCP`**. Cualquier otro remoto o rama queda excluido para `push`.

| Remoto | URL | Uso |
|---|---|---|
| `origin` | `git@gitlab.com:anlucorporations/hotel-room-mcp-trazable.git` | GitLab de `anlucorporations` |
| `github` | `git@github.com:anlucorporations/hotel-room-mcp-trazable.git` | GitHub de `anlucorporations` |
| `codecrypto` | `git@gitlab.codecrypto.academy:anlucorporations/hotel-room-mcp-trazable.git` | GitLab de Codecrypto |

- **Rama de `push`**: **`Hotel-DSH-GCP-v3`** para la línea de la v3 (desde el 2026-10-07), replicada
  en los tres remotos. En esta línea **no se empuja ninguna otra rama**: `Hotel-DSH-GCP` (`5cc8c22`,
  trabajo de la Suite de Operaciones) y `main` (`42255fd`) no se tocan desde aquí.
- **Regla del proceso**: no se hace `push` sin orden explícita del responsable (comando `/push`). El `push` autorizado va **solo** a los remotos de `anlucorporations` y **solo** a la rama vigente indicada arriba.
- Todos los remotos usan **SSH**; no hay credenciales embebidas en `.git/config` (verificado: 0 coincidencias de token).

> ⚠️ **Deuda heredada (B-0)**: existió un token de GitLab en claro en el remoto `gitlab-public`, que ya no existe. No queda ninguna URL con credenciales embebidas en este checkout; la **rotación del token histórico** sigue siendo tarea del responsable.

---

## 2. Matriz de entornos

| Parámetro | Desarrollo (vigente) | Besu (documentado, sin uso hoy) | Polygon (roadmap) |
|---|---|---|---|
| Red | **Anvil local** | Besu de Codecrypto | Polygon PoS 137 / Amoy 80002 |
| `chainId` | **81234** | 81234 | 137 / 80002 |
| RPC | **`http://127.0.0.1:8545`** | `besu1/besu2.proyectos.codecrypto.academy` | Alchemy / Infura |
| Moneda | **ETH** (ETH nativo de Anvil) | ETH | POL |
| Contrato | **`HotelNights`** | `HotelNights` | `HotelNights` |
| Confirmaciones | **1** (finalidad inmediata) | 1 | 32 (a configurar) |
| Rango de `getLogs` | **5.000 bloques** | 5.000 | 2.000 |
| Base de datos | **PostgreSQL 18 local** | PostgreSQL | PostgreSQL gestionado |
| Redis | **nativo local** | sí | gestionado |
| Observabilidad | logging estructurado | logging | + Sentry (fuera de alcance por D-12) |

Los valores de Polygon quedan **documentados como configuración de mainnet** (D-12): no se implementan parámetros anti-reorganización ni failover multi-RPC.

---

## 3. Inventario de variables de entorno

Estado respecto a `.env.example`: **OK** = presente · **FALTA** = la exige el código y no está en la plantilla · **OBSOLETA** = está y ya no la usa nadie.

### 3.1 Cadena y contrato

| Variable | Componente | Obligatoria | Plantilla | Observación |
|---|---|---|---|---|
| `CHAIN_ID` | todos | sí | OK | Debe valer **81234** (la plantilla dice 31337) |
| `RPC_URL` | worker, mcp, web (servidor) | sí | OK | `http://127.0.0.1:8545` en local |
| `CONTRACT_ADDRESS` | worker, mcp | sí | **FALTA** | Dirección de `HotelNights` |
| `RPC_FALLBACK_URL` | — | no | OBSOLETA | Sin consumidores (D-12 retira el failover) |
| `HOTEL_NFT_ADDRESS` | — | no | OBSOLETA | Generación legacy (D-02) |
| `HOTEL_MARKETPLACE_ADDRESS` | — | no | OBSOLETA | Generación legacy (D-02) |

### 3.2 Web (cliente, inyectadas en la compilación)

| Variable | Obligatoria | Plantilla | Observación |
|---|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | sí | **FALTA** | Por defecto `http://127.0.0.1:8545` en `config/chain.ts` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | sí | **FALTA** | Hoy cae a una dirección de Anvil escrita en el código |
| `NEXT_PUBLIC_MARKETPLACE_ADDRESS` | no | **FALTA** | Se retira con D-07 al unificar en `HotelNights` |
| `NEXT_PUBLIC_CHAIN_ID` | no | **FALTA** | Debe valer 81234 |
| `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | sí | **FALTA** | Punto de inicio del escaneo de eventos |
| `NEXT_PUBLIC_NETWORK` | no | **FALTA** | `besu` o vacío |
| `NEXT_PUBLIC_FAUCET_ADDRESS` | no | **FALTA** | Solo en desarrollo; sin ella se oculta el faucet |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL` / `_NAME` | no | **FALTA** | Anvil no tiene explorador |

### 3.3 Base de datos y Redis

| Variable | Componente | Obligatoria | Plantilla | Observación |
|---|---|---|---|---|
| `DATABASE_URL` | web, worker, mcp | sí | OK | Apunta a `hotel_admin@127.0.0.1:5432/hotel_nft_dev`; el entorno tiene PostgreSQL 18 y **el rol y la base aún no existen (B-1)** |
| `DATABASE_POOL_MIN` / `_MAX` | web | no | OK | El SRS fija máximo 20 |
| `REDIS_URL` | web, worker | sí | OK | Redis **no está instalado (B-2)** |

### 3.4 Autenticación y seguridad

| Variable | Componente | Obligatoria | Plantilla | Observación |
|---|---|---|---|---|
| `SESSION_SECRET` | web | sí | **FALTA** | Firma la cookie de sesión; obligatoria fuera de desarrollo |
| `JWT_SECRET` | shared/auth | sí | **FALTA** | Hoy con valor por defecto en el código (a eliminar) |
| `TICKET_SIGNING_SECRET` | shared/passes | sí | **FALTA** | Idem |
| `CHECKIN_SECRET_KEY` | shared, web | sí | **FALTA** | Clave AES-256-GCM del secreto de check-in |
| `JWT_ACCESS_EXPIRATION` / `_REFRESH_EXPIRATION` | shared/auth | no | OK | 900 s / 604 800 s |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | shared/auth | no | OK | El código actual usa HS256; revisar coherencia con RS256 del SRS |
| `AES_SECRET_KEY` | shared | sí | OK | Debe ser un secreto real, no el valor de ejemplo |
| `SESSION_TRACE_SECRET` | shared/auth | no | OK (vacío) | Clave del HMAC que pseudonimiza la IP y el *user agent* de los accesos de operadores (ADR-24). Si falta, se deriva de `AES_SECRET_KEY` |
| `RETENTION_INTERVAL_MS` / `NOTIFICATIONS_RETENTION_DAYS` | worker | no | OK | Planificador de retención: cada 6 h y 90 días de conservación de correos enviados |
| `DEPLOYER_PRIVATE_KEY` | contratos | sí | OK | Clave de despliegue (en Anvil, cuenta conocida) |
| `MINTER_RELAYER_PRIVATE_KEY`, `BURNER_BOT_PRIVATE_KEY`, `RECEPTION_WALLET_PRIVATE_KEY` | shared/burner, despliegue | sí | OK | D-04 añade la hot-wallet con `RECEPTION_ROLE` |
| `GNOSIS_SAFE_ADDRESS` | despliegue | no | OK (vacío) | Multisig de D-11 (B-7) |

### 3.5 Servicios externos

| Variable | Componente | Obligatoria | Plantilla | Observación |
|---|---|---|---|---|
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | worker, monitor | sí | OK | SendGrid por defecto |
| `ADMIN_EMAIL` | worker | sí | **FALTA** | Destinatario de los avisos de venta |
| `ALERT_EMAIL` | monitor | sí | **FALTA** | Destinatario de las alertas (`DEVOPS_ALERT_EMAIL` existe para otro uso) |
| `OWNER_EMAIL` | despliegue/semillas | no | OK | Correo de Carlos |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT` | shared/push | sí (con D-03) | OK / vacías | **La clave pública de ejemplo contiene un espacio y es inválida** |
| `ASSISTANT_PROVIDER` | web (asistente) | no | NUEVA (v3) | Conmutador del LLM: `vertex` (por defecto) o `anthropic`. Ver §3.7 |
| `VERTEX_MODEL` / `VERTEX_LOCATION` | web (asistente) | no | NUEVA (v3) | Por defecto `gemini-2.5-flash-lite` y `europe-west1` |
| `VERTEX_MAX_OUTPUT_TOKENS` | web (asistente) | no | NUEVA (v3) | Tope de salida (por defecto 512); palanca de coste RNF-24 |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | web (asistente) | solo si `ASSISTANT_PROVIDER=anthropic` | **FALTA** | Respaldo conmutable (~82 USD/mes). Ya **no** es necesaria con Vertex |
| `MCP_BASE_URL` / `MCP_SHARED_SECRET` | web ↔ mcp | sí (asistente) | **FALTA** | Pasarela MCP local |
| `COINGECKO_API_KEY`, `BINANCE_FALLBACK_API_URL` | shared/rates | no | OK | Fallback hoy con valor fijo |
| `APPLE_PASS_*`, `APPLE_TEAM_IDENTIFIER`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` | web/passes | sí (con D-11) | vacías | Pases Apple/Google reales |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` | — | no | OBSOLETA | **D-12 retira Sentry**; el hook queda inerte |

### 3.6 Servicios propios

| Variable | Componente | Obligatoria | Plantilla |
|---|---|---|---|
| `WORKER_HOST` / `WORKER_PORT` | worker | no | **FALTA** |
| `MCP_HOST` / `MCP_PORT` | mcp | no | **FALTA** |
| `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` | mcp | sí en producción | **FALTA** |
| `MONITOR_TARGETS` | monitor | sí | **FALTA** |
| `LOG_LEVEL` | todos | no | OK |

> **Conclusión**: copiar `.env.example` tal cual **no arranca el sistema** (el `fail-fast` de zod rechaza la configuración). La corrección de la plantilla es tarea del hito **M0**.

### 3.7 Asistente IA — conmutador de proveedor (v3, hito H1)

El asistente elige el LLM por variable de entorno; el resto del código solo ve el puerto `LlmClient`
(`apps/web/src/lib/assistant/llm.ts`). La composición vive en `apps/web/src/lib/assistant/llm-provider.ts`.

| Proveedor | Variables | Autenticación | Coste estimado | Residencia del dato |
|---|---|---|---|---|
| **`vertex`** (por defecto) | `VERTEX_MODEL`, `VERTEX_LOCATION`, `VERTEX_MAX_OUTPUT_TOKENS` | Cuenta de servicio `hotel-mcp-run@` (**sin secretos nuevos**; ADC) | ≈ 2,6 USD/mes | **UE** (`europe-west1`) |
| `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Clave de API en Secret Manager | ≈ 82 USD/mes | US |

- El proyecto de Vertex se toma de `GOOGLE_VERTEX_PROJECT`, o de `GOOGLE_CLOUD_PROJECT` /
  `GCLOUD_PROJECT` (estas dos las inyecta Cloud Run automáticamente). **Si no hay proyecto, la ruta
  falla en cerrado (503)** y la UI ofrece la navegación manual, en lugar de devolver un 500.
- El import del SDK de Vertex es dinámico: con `ASSISTANT_PROVIDER=anthropic` no se carga
  `google-auth-library` ni el Vercel AI SDK (menos peso en el arranque en frío).

---

## 4. Servicios y puertos

| Servicio | Puerto | Estado en esta máquina | Notas |
|---|---|---|---|
| Anvil | 8545 | **activo** (`chain-id 81234`, bloque > 31.000) | `forge`/`anvil`/`cast` v1.7.2 instalados |
| PostgreSQL | 5432 | **activo** (`postgresql-x64-18`) | Rol `hotel_admin` y base `hotel_nft_dev` creados (B-1 resuelto) |
| Redis | 6379 | **activo** — Memurai 4.1.2 (`redis_version 7.2.5`) | Arranque: `pwsh scripts/dev/start-redis.ps1` · ver nota al pie |
| Web (Next.js) | 3000 | **activo** con `deploy-local.ps1` | `next start` sobre el build de producción |
| Worker (HTTP) | `WORKER_PORT` = 8787 | **activo** con `deploy-local.ps1` | `/health`, `/aggregates`, `/history` (sin autenticación hoy) |
| MCP (HTTP) | `MCP_PORT` = **8790** | **activo** con `deploy-local.ps1` | Se movió del 8788 porque ese puerto lo ocupa un servidor HTTP de otro proyecto de la máquina |
| Sumidero SMTP (dev) | 2525 | **activo** con `deploy-local.ps1` | `scripts/dev/smtp-sink.ts`: entrega real de correo en local para que el worker no quede degradado |
| pgAdmin | 8123 | libre | Opcional |

> **Despliegue local completo**: `pwsh scripts/dev/deploy-local.ps1` (arranca y comprueba worker, MCP,
> monitor y web, con el sumidero de correo), `-Status` para ver el estado y `-Stop` para pararlo.
> Los logs quedan en `.deploy-logs/` (ignorado por git).

Docker **no está instalado** en esta máquina, así que el `docker-compose.yml` (PostgreSQL 16 + Redis 7) no es utilizable aquí; se conserva como referencia para otros entornos.

> **Nota sobre Redis en Windows sin Docker.** El paquete `Redis.Redis` de winget es la versión **3.0.504** y BullMQ 6 exige mínimo **5.0.0** (recomendado 6.2.0): no sirve. El MSI de Memurai Developer **falla al instalar** aquí (aborta en `ca_SilentCheckIfPortIsAvailable` tras un error de permisos en su acción personalizada, con el puerto libre). Solución aplicada y documentada: extracción administrativa del MSI oficial con `msiexec /a` a `C:\Users\lucci\memurai` y arranque del binario **sin instalar servicio**, mediante `scripts/dev/start-redis.ps1`. No se descargó ningún binario de terceros.

---

## 5. Comandos operativos

```bash
# Dependencias y comprobaciones
pnpm install
pnpm typecheck                 # 6/6 verde
pnpm test                      # 7/7 tareas, 632 pruebas verdes (M4)
pnpm --filter @hotel/contracts test    # forge test: 16 suites / 146 verdes
pnpm lint

# Cadena local
anvil --chain-id 81234 --block-time 2  # red canónica (D-01); reiniciar borra el estado
forge build --root packages/contracts
# Despliegue canónico con bootstrap de roles (M1) + registro validado por esquema:
#   DEPLOYER_PRIVATE_KEY, ADMIN_ADDRESS, MINTER_ADDRESS, RECEPTION_ADDRESS, DEPLOY_FAUCET, FAUCET_FUND_WEI
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --slow
pnpm --filter @hotel/contracts sync    # → packages/shared/deployments/<chainId>.json
# Tras desplegar, actualizar en `.env`: CONTRACT_ADDRESS, NEXT_PUBLIC_CONTRACT_ADDRESS,
# NEXT_PUBLIC_DEPLOYMENT_BLOCK (bloque del despliegue) y NEXT_PUBLIC_FAUCET_ADDRESS.

# E2E real del hito M4 (compra primaria → listado → reventa → claim) sobre Anvil:
pnpm test:e2e:m4                       # firma de verdad; evidencia en RepoTecnico/evidencias/
# E2E real del hito M5 (check-in con ancla on-chain, resguardo de un solo uso, contingencia sin PII):
pnpm test:e2e:m5                       # Anvil + PostgreSQL + Redis reales; evidencia en RepoTecnico/evidencias/
# E2E real del hito M6 (quema por planificador, cola única de correo, push real y alerta de silencio):
pnpm test:e2e:m6                       # usa un sumidero SMTP y un servicio de push LOCALES (sin servicios externos)
#   OJO: el E2E de M6 VIAJA EN EL TIEMPO de la cadena (+40 días) para caducar una noche. Los guiones
#   calculan sus fechas con el reloj de la CADENA, así que son re-ejecutables; para volver al presente:
#   reiniciar Anvil, redesplegar (`forge script script/Deploy.s.sol:Deploy --broadcast`) y `pnpm --filter @hotel/contracts sync`.

# Operadores (D-04/D-05): contraseña + TOTP obligatorio. La semilla se muestra UNA vez.
pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es --password '<clave>'
pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es --password '<clave>'
#   La hot-wallet de recepción (RECEPTION_WALLET_PRIVATE_KEY, cuenta 3 de Anvil) es la que firma
#   markCheckedIn: sin ella el check-in falla en cerrado (503 ANCLAJE_NO_CONFIGURADO).

# Base de datos
psql -U hotel_admin -d hotel_nft_dev -h 127.0.0.1     # requiere B-1
psql -U postgres -c "CREATE ROLE hotel_admin LOGIN PASSWORD '…'"   # acción manual pendiente

# Redis (Memurai extraido del MSI oficial; ver nota al pie)
pwsh scripts/dev/start-redis.ps1          # arranca y verifica la version
pwsh scripts/dev/start-redis.ps1 -Stop    # detiene
& "$env:USERPROFILE\memurai\Memurai\memurai-cli.exe" ping

# Aplicaciones
pnpm --filter @hotel/web dev
pnpm --filter @hotel/worker dev
pnpm --filter @hotel/mcp dev
pnpm --filter @hotel/monitor dev

# Carga (tras instalar k6)
k6 run scripts/load-tests/catalog-load.js
```

---

## 5.1 Cómo carga cada componente el entorno

Next.js **solo lee los ficheros `.env` de su propio directorio de proyecto**, así que en un monorepo hay que cargar explícitamente el `.env` de la raíz. Cada componente lo hace en su punto de arranque:

| Componente | Dónde se carga | Nota |
|---|---|---|
| `apps/web` | `next.config.mjs` (al evaluar la configuración) | Se hace ahí y no en un hook de arranque porque este módulo se carga en el proceso CLI **antes** de que Next arranque sus workers, que heredan `process.env`. La raíz se localiza subiendo hasta `pnpm-workspace.yaml`, para no depender del directorio desde el que se lance el comando |
| `apps/worker`, `apps/mcp`, `apps/monitor` | `process.loadEnvFile` en su `main.ts` | Node no carga `.env` por sí solo; sin esto los tres servicios fallaban al arrancar con variables que sí estaban definidas |
| Scripts de `packages/shared` | `node --env-file=../../.env --import tsx` | `tsx` es necesario porque los imports relativos de `src` van sin extensión y el *type stripping* de Node los rechaza |

En producción (contenedor o CI) lo habitual es que no exista el fichero `.env` y las variables lleguen del entorno: por eso su ausencia no es un error, pero **si falta un secreto obligatorio el arranque falla en cerrado** con un mensaje explícito (`MissingSecretError`, CWE-798).

### Aprovisionamiento de operadores (D-04)

```bash
# Crea o ACTUALIZA un operador y entrega otpauth:// + códigos de rescate (una sola vez)
pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es --role DEFAULT_ADMIN_ROLE
pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
# Si no se pasa --password se genera una aleatoria fuerte y se imprime
```

En la base solo quedan el hash bcrypt y la semilla TOTP cifrada con AES-256-GCM (`AES_SECRET_KEY`).

---
## 6. Credenciales y accesos pendientes

| # | Qué falta | Para qué | Quién |
|---|---|---|---|
| B-0 | Revocar y regenerar el token de GitLab expuesto en el remoto | Seguridad inmediata | Responsable |
| B-1 | Contraseña del superusuario `postgres`, o creación manual del rol y la base | M0 y toda la verificación contra PostgreSQL | Responsable del entorno |
| B-2 | Redis instalado | M0, M3 y M6 | Entorno |
| B-3 | k6 instalado | M8 | Entorno |
| B-4 | Proyecto en WalletConnect Cloud (`projectId`) | M4/M7 (D-11) | Cliente |
| B-5 | Credenciales o certificado del PMS del hotel | M5 (D-13) | Cliente |
| B-6 | Fotos definitivas de los tres tipos de habitación | M7 (catálogo) | Cliente |
| B-7 | Dos firmantes y política de custodia de claves | M9 (D-11) | Cliente |
| B-8 | Credenciales de GCP, si se quiere un entorno de preview desplegado | Fase de despliegue | Responsable |

**Sobre GCP (actualizado 2026-09-25)**: el proyecto **`hotel-mcp`** (`hotelMCP`,
nº `475955050238`, carpeta *Development* de `anlucorporations-org`) está creado
y preparado. Ya no hay credenciales sueltas: la CI se autentica por **Workload
Identity Federation** (OIDC de GitHub y de GitLab, sin claves JSON porque la
organización prohíbe `constraints/iam.disableServiceAccountKeyCreation`).
Recursos aprovisionados: Artifact Registry, Cloud SQL PostgreSQL 18 con IP
privada (`hotel-mcp-pg`, por `constraints/sql.restrictPublicIp`), VPC
`hotel-mcp-vpc` con Private Service Access, 6 secretos en Secret Manager y un
Cloud Run placeholder. Reproducible con `bash infra/gcp/bootstrap.sh`; detalle
en [`infraestructura_gcp.md`](./infraestructura_gcp.md) e [`infra/gcp/README.md`](../infra/gcp/README.md).
Lo pendiente es construcción (Dockerfiles y job de despliegue), no una
dependencia externa.

---

## 7. Rutas clave del repositorio

| Ruta | Contenido |
|---|---|
| `docs/` | Especificaciones (PRD, SRS, plan, backlog), guías operativas y el brief del cliente |
| `RepoTecnico/` | Documentación de gestión del proyecto: estado, requerimientos, diccionario de datos, entornos, informes de auditoría, decisiones y planes de implementación |
| `packages/contracts/src/` | `HotelNights.sol` (canónico), `IHotelNights.sol`, `Faucet.sol`, librerías; `HotelNFT.sol`/`HotelMarketplace.sol` son legacy |
| `packages/contracts/script/` | `Deploy.s.sol` (hoy solo despliega la generación legacy) |
| `packages/shared/src/` | Dominio, ABIs, base de datos, autenticación, eventos, colas, servicios |
| `apps/web/src/app/api/` | 25 rutas de API |
| `apps/worker/src/` | Listener, procesadores, correo y servidor HTTP |
| `scripts/` | Operación: respaldo, E2E, carga |
| `.data/` | Ignorado por git; hoy contiene los SQLite del worker (desaparecen en M2) |

---

*Entornos globales · actualizar al cerrar M0 (plantilla de entorno, Redis y credenciales) y al confirmar la necesidad de GCP.*


---

## pgAdmin y la base de datos del hotel (análisis GCP · 2026-09-30)

**Dónde vive el pgAdmin.** Servicio Cloud Run `mcc-pgadmin` en el proyecto **`mcc-ecommerce`**
(región `europe-west1`, URL `https://mcc-pgadmin-slzlptbcla-ew.a.run.app`, imagen
`dpage/pgadmin4:latest`). La contraseña viene del secreto `PGADMIN_PASSWORD` del mismo proyecto.
El acceso está abierto a `allUsers` (solo lo protege el login de pgAdmin): **endurecimiento
pendiente** (IAP o invoke-only, fijar la versión de la imagen).

**La base de datos del hotel** es Cloud SQL **`hotel-mcp-pg`** (PostgreSQL 18, `europe-west1-b`,
proyecto **`hotel-mcp`**, IP privada `10.104.0.3` en el rango PSA `10.104.0.0/29`, red propia
`hotel-mcp-vpc` / subred `hotel-mcp-euw1` 10.10.0.0/24, **sin IP pública**).

**Intento de conectarlos (direct VPC entre proyectos) — resultado: NO es posible con los recursos
actuales.** Se ejecutó y verificó: API de Service Networking habilitada en `mcc-ecommerce`;
concesiones `roles/compute.networkUser` a la SA de pgadmin y al agente serverless del consumidor
sobre la red y la subred del host; prueba de Shared VPC vía IAM con `X-Goog-Compute-Target-Project`.
Cloud Run rechazó la revisión con «Access to the subnetwork hotel-mcp-euw1 is not allowed»: el
mecanismo exige que `hotel-mcp` sea **host project designado** (recurso `compute.networks` con
consumidores compartidos), y este SDK no expone ese comando; además un conector VPC propio quedó en
ERROR por conflicto de rangos con la subred automática de `default`. **Todo fue revertido**: el
pgadmin quedó exactamente como estaba (imagen dpage, puerto 8080 con sonda coherente, secreto
intacto, UI respondiendo 200) y se retiraron las concesiones de exceso (`compute.networkAdmin`).

**Caminos viables para administrar la BD del hotel (elegir uno):**
1. **Proxy local + cliente** (inmediato, sin tocar producción): `~/tools/cloud-sql-proxy` ya está
   instalado → `cloud-sql-proxy hotel-mcp:europe-west1:hotel-mcp-pg` y conectar psql/pgcli a
   localhost:5432. Requiere rol `roles/cloudsql.client` para la cuenta personal (se concede solo si
   se pide).
2. **PgAdmin dentro del proyecto del hotel** (recomendado para uso estable): desplegar
   `dpage/pgadmin4` en `hotel-mcp` con direct VPC sobre `hotel-mcp-euw1` (misma red: sin Shared
   VPC), `ingress internal` o IAP, credenciales en Secret Manager. ~15 minutos de trabajo.
3. **Consola de Google** → Cloud SQL → `hotel-mcp-pg` → pestaña *SQL*: cero infraestructura nueva,
   válido para consultas puntuales.
