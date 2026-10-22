# Despliegue en GCP — hotelMCP

> **Proyecto**: `hotel-room-mcp-trazable` · **Fecha**: 2026-09-25
> **Estado**: desplegado y verificado end-to-end sobre servicios globales
> **Proyecto GCP**: `hotel-mcp` (nº `475955050238`, `europe-west1`)
> **Continuación de**: [`infraestructura_gcp.md`](./infraestructura_gcp.md) (proyecto base)

---

## 1. Resumen

El sistema está desplegado en Google Cloud y **funcionando**: la web carga, el
worker indexa eventos de la cadena en PostgreSQL, el MCP responde y el monitor
vigila. Todos los componentes consumen **servicios globales compartidos**:

| Servicio global | Dónde | Identificador |
|---|---|---|
| **Anvil (Foundry)** | Ya existente en el proyecto `mcc-ecommerce` | `https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app` — chainId **31337** |
| **PostgreSQL** | Cloud SQL del proyecto | `hotel-mcp-pg` — IP privada `10.104.0.3`, base `hotel_nft` |
| **Redis** | VM privada nueva | `hotel-mcp-redis` — `10.10.0.10:6379` |

La decisión inicial era alojar un Anvil propio; se descartó al **verificar que
ya existe un servicio Foundry/Anvil desplegado en GCP** (indicación del
responsable), que es el que se usa.

---

## 2. Arquitectura

```
                        Internet
                           │
        ┌──────────────────┴───────────────────┐
        │  Cloud Run (público, allUsers)       │
        │                                      │
        │  hotel-mcp-web  :3000  ──┐           │
        │  hotel-mcp-mcp  :8080  ──┤           │
        │  hotel-mcp-worker :8080 ─┘           │
        └──────────┬───────────────────────────┘
                   │ Direct VPC egress (hotel-mcp-vpc / hotel-mcp-euw1)
                   │
     ┌─────────────┼───────────────────────────────┐
     │             │                               │
     ▼             ▼                               ▼
 Cloud SQL     VM Redis                    Anvil global (público)
 hotel-mcp-pg  10.10.0.10                  mcc-foundry-anvil (chainId 31337)
 10.104.0.3    (Redis 7)                   estado en GCS: mcc-ecommerce-anvil-state

 Cloud Run worker pool: hotel-mcp-monitor (sin HTTP, sondea /health)
 Cloud Run job:         hotel-mcp-inject-data (siembra, bajo demanda)
```

- **web** → `worker` y `mcp` por sus URLs públicas (`WORKER_BASE_URL`,
  `MCP_BASE_URL`); `mcp` protegido además con `MCP_SHARED_SECRET` (Bearer).
- **worker** → Anvil (eventos), Cloud SQL (estado/agregados), Redis (BullMQ).
- **mcp** → Anvil (lectura) + Cloud SQL.
- **monitor** → sondea `/health` de worker y mcp, y la cadena.

---

## 3. Servicios globales

### 3.1. Anvil (Foundry) — reutilizado

Servicio Cloud Run del proyecto `mcc-ecommerce`:

- Imagen `europe-west1-docker.pkg.dev/mcc-ecommerce/mcc-ecommerce-repo/mcc-foundry-anvil`
- Anvil `v1.5.1`, **chainId 31337**, `maxScale=1`, puerto 8545
- Estado persistido con **GCS Fuse** sobre `mcc-ecommerce-anvil-state` (`/data`)
- Público (`allUsers` → `run.invoker`)

> **Desviación documentada**: el proyecto define `CHAIN_ID = 81234` (espejo de
> Besu) como constante en `packages/shared/src/constants.ts`. El Anvil global
> usa 31337. La aplicación **lo admite por entorno** (`CHAIN_ID`,
> `NEXT_PUBLIC_CHAIN_ID`), así que no se tocó código de la app para esto; todos
> los componentes se despliegan con `CHAIN_ID=31337`.

### 3.2. PostgreSQL — Cloud SQL `hotel-mcp-pg`

PostgreSQL 18, `db-f1-micro`, zonal, **sin IP pública**
(`constraints/sql.restrictPublicIp`), accesible por Private Service Access.
Base `hotel_nft`, usuario `hotel_admin`. **El worker aplica las migraciones al
arrancar** (no hubo paso de migración separado).

### 3.3. Redis — VM `hotel-mcp-redis`

La VM no puede tener IP pública (`constraints/compute.vmExternalIpAccess`), así
que se creó **Cloud NAT** (`hotel-mcp-router` / `hotel-mcp-nat`) para que la VM
instale paquetes. Redis 7 con `requirepass`, firewall que solo permite
`tcp:6379` desde la subred `10.10.0.0/24`, y SSH de operación por IAP.

- Contraseña generada con `openssl`, guardada en
  `~/.config/hotel-mcp/redis-password` y en Secret Manager (`hotel-redis-url`).

---

## 4. Contratos

Desplegados con Foundry contra el Anvil global:

| Dato | Valor |
|---|---|
| Contrato `HotelNights` | `0x70bDA08DBe07363968e9EE53d899dFE48560605B` |
| Faucet (solo pruebas) | `0xaB7B4c595d3cE8C85e16DA86630f2fc223B05057` |
| Bloque de despliegue | `288` |
| chainId | `31337` |
| Registro | `packages/shared/deployments/31337.json` |

Roles concedidos al propietario (cuenta 0) y `RECEPTION_ROLE` al operador de
check-in (cuenta 1) mediante la siembra.

---

## 5. Aplicaciones desplegadas

| Componente | Cloud Run | Imagen | Notas |
|---|---|---|---|
| Web | `hotel-mcp-web` (`:3000`) | `hotel-mcp/web:v1` | Next.js; `NEXT_PUBLIC_*` inyectadas en build |
| Worker | `hotel-mcp-worker` (`:8080`) | `hotel-mcp/worker:v1` | `--no-cpu-throttling`, 1 instancia |
| MCP | `hotel-mcp-mcp` (`:8080`) | `hotel-mcp/mcp:v2` | Streamable HTTP + `/health` |
| Monitor | worker pool `hotel-mcp-monitor` | `hotel-mcp/monitor:v1` | Sin HTTP → worker pool de Cloud Run |
| Siembra | job `hotel-mcp-inject-data` | `hotel-mcp/mcp:v2` | Bajo demanda |

URLs:

```
web    https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app
mcp    https://hotel-mcp-mcp-d6jlzeq5yq-ew.a.run.app
worker https://hotel-mcp-worker-d6jlzeq5yq-ew.a.run.app
```

Todas usan la cuenta `hotel-mcp-run@hotel-mcp.iam.gserviceaccount.com` y
egress VPC (`--network=hotel-mcp-vpc --subnet=hotel-mcp-euw1
--vpc-egress=private-ranges-only`), con secretos inyectados desde Secret Manager.

---

## 6. Construcción de imágenes (Cloud Build)

No hay Docker en el entorno local, así que las imágenes se construyen con
**Cloud Build** a partir de un único [`Dockerfile`](../Dockerfile) parametrizado
por `--build-arg APP=<web|worker|mcp|monitor>` y
[`infra/docker/cloudbuild.yaml`](../infra/docker/cloudbuild.yaml).

- `.gcloudignore` explícito (no deriva de `.gitignore`: el registro
  `packages/shared/deployments/*.json` está en `.gitignore` pero la imagen lo
  necesita).
- **Deuda cerrada en el incremento v2**: `pnpm-lock.yaml` se sincronizó con `pnpm@10.32.1`, así
  que el `Dockerfile` volvió a `pnpm install --frozen-lockfile` (un `package.json` sin lockfile
  rompe el build en lugar de resolver versiones nuevas en silencio).
- La SA por defecto de Compute necesitó `roles/storage.admin` y
  `roles/artifactregistry.writer` para poder construir y publicar.

---

## 7. Siembra de datos

Ejecutada con el job `hotel-mcp-inject-data`
(`pnpm --filter @hotel/contracts inject:data`) contra el Anvil global y Cloud SQL:

- Roles on-chain concedidos de forma idempotente.
- Operadores de administración y recepción aprovisionados en la base, con
  contraseña + semilla TOTP (impresas **una sola vez**; volcado completo en
  `~/.config/hotel-mcp/inject-data-output.txt`, permisos `600`, fuera del repo).
- 5 noches minteadas (habitaciones 108, 118, 124 simples/dobles y 202, 210
  suites), compradas y con una reventa publicada.

> **Corrección aplicada**: `packages/contracts/scripts/inject-data.ts` construía
> los clientes viem con `anvilChain` (`id = 81234` hardcodeado). Contra el Anvil
> global (31337) la transacción se rechazaba con *"Transaction creation failed."*.
> Ahora la cadena de los clientes se deriva de `CHAIN_ID`.

---

## 8. Política de organización: excepción aplicada

La organización aplica **Domain Restricted Sharing**
(`constraints/iam.allowedPolicyMemberDomains`) restringido a identidades de la
organización, lo que rechazaba `allUsers` y hacía **imposible publicar** ningún
servicio Cloud Run. Con autorización explícita del responsable se aplicó una
**excepción a nivel de proyecto** (no de organización):

```yaml
# gcloud resource-manager org-policies set-policy ...
constraint: constraints/iam.allowedPolicyMemberDomains
listPolicy:
  allValues: ALLOW
```

Para revertirla:

```bash
gcloud resource-manager org-policies delete constraints/iam.allowedPolicyMemberDomains \
  --project=hotel-mcp
```

Otras políticas que condicionaron el diseño (ya documentadas en
`infraestructura_gcp.md`): `iam.disableServiceAccountKeyCreation`,
`sql.restrictPublicIp`, `compute.vmExternalIpAccess`.

---

## 9. Verificación

| Comprobación | Resultado |
|---|---|
| `/health/ready` de la web | `{"status":"READY","dependencies":{"postgres":"UP","redis":"UP","polygonRPC":"UP"}}` |
| Home de la web | HTTP 200, `<title>Hotel Marina del Sol</title>` |
| `/health` del worker | `status:ok`, `lag:0`, bloque al día |
| `/health` del mcp | `status:ok`, `block` actual |
| Monitor (worker pool) | `Ready · CONDITION_SUCCEEDED`, sondeando |
| Contrato en el Anvil global | `cast chain-id` = 31337; roles y supply activos |
| `/api/nfts` | Devuelve noches sembradas con `onChainAnchored: true` |
| Worker ↔ Cloud SQL ↔ Redis | Conectados (estado en los `/health`) |
| Siembra | 5 noches minteadas + operadores + reventa |

---

## 10. Pendientes y notas

| # | Punto |
|---|---|
| P-1 | ✅ **Cerrado (incremento v2)**: lockfile sincronizado y `--frozen-lockfile` restaurado en el `Dockerfile`. |
| P-2 | El placeholder `hotel-mcp-health` puede retirarse. |
| P-3 | El `worker` y el `mcp` son invocables sin autenticación para que la web pueda llamarlos (la app no implementa *ID tokens* de servicio a servicio). El script ya despliega **ambos** con `--allow-unauthenticated` (antes el worker se desplegaba privado y la web perdía `/aggregates` y `/history`). Cerrarlo exige firmar con el ID token de la SA en `lib/worker-api.ts`. |
| P-4 | El monitor usa `besuChain` (id 81234) cuando el chainId no es 81234; conviene derivarlo de `CHAIN_ID` igual que en la siembra. |
| P-5 | Anvil **compartido** con `mcc-ecommerce`: su estado y su ciclo de reinicios afectan a este despliegue. |
| P-6 | Credenciales de operador en `~/.config/hotel-mcp/inject-data-output.txt`; rotarlas antes de cualquier uso real. |
| P-7 | **Coste**: Cloud SQL 24/7 + VM e2-micro + Cloud NAT + Cloud Run. Revisar facturación; apagar Cloud SQL si no se usa. |

---

## 11. Reproducción

```bash
# 1) Base (proyecto, APIs, IAM, WIF, Cloud SQL, secretos)
bash infra/gcp/bootstrap.sh

# 2) Redis global (VM + NAT)
#    (ver §3.3; el script 40 crea la red, no la VM de Redis)

# 3) Contratos en el Anvil global
RPC_URL=https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app \
DEPLOYER_PRIVATE_KEY=0xac0974... \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow

# 4) Imágenes (Cloud Build)
gcloud builds submit --config=infra/docker/cloudbuild.yaml \
  --substitutions=_APP=web,_IMAGE=.../web:v1,_NEXT_PUBLIC_RPC_URL=...,...

# 5) Aplicaciones
bash infra/gcp/70-deploy-apps.sh

# 6) Siembra (job)
gcloud run jobs execute hotel-mcp-inject-data --region=europe-west1
```

---

## 12. Actualización · incremento v2 (2026-09-26)

Se redesplegó la plataforma con el incremento v2 (owner, recepción y reventa) sin recrear
infraestructura.

| Paso | Detalle |
|---|---|
| Imágenes | Cloud Build `web:v2` (con `NEXT_PUBLIC_CHAIN_ID=31337`, contrato `0x70bD…605B`, bloque 288) y `worker:v2`; `mcp:v2` se mantuvo |
| Revisión | `hotel-mcp-worker-00002`, `hotel-mcp-mcp-00002`, `hotel-mcp-web-00002` (100 % de tráfico) |
| Migración | La aplica el **worker al arrancar** (`runMigrations`): crea `additional_charges`, `stay_checkouts`, `checkout_incidents` y `nfts.recovery_code` |
| Web Push | Nuevo secreto `hotel-vapid-private-key` en Secret Manager; `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` como env en worker y web (el script los inyecta) |
| Script | `70-deploy-apps.sh` despliega el worker con `--allow-unauthenticated` (P-3) y exige el secreto VAPID; el `Dockerfile` usa `--frozen-lockfile` (P-1 cerrado) |

### Verificación (sobre el despliegue real)

| Comprobación | Resultado |
|---|---|
| Home de la web | HTTP 200 |
| `/health/ready` | `READY` (postgres, redis y RPC `UP`) |
| `/api/push/vapid` | HTTP 200 con la clave pública VAPID |
| `/api/reception/overview` sin sesión | HTTP **401** (protegido) |
| `/api/reception/overview` con sesión de **recepción** | HTTP 200 · **50 habitaciones**, reserva 108 (`SOLD`) con `recoveryCode MDS-PNEKH8K6` |
| `GET /api/reception/reservations/lookup?code=MDS-PNEKH8K6` | HTTP 200 con la reserva |
| `/api/reception/overview` con **owner** (`DEFAULT_ADMIN_ROLE`) | HTTP 200 (D-30/D-37) |
| `/api/sales/history` (web → worker) | HTTP 200 con datos (worker invocable) |
| `/health` del worker | `status: ok`, `lag: 0`, sin degradación |

El login E2E se hizo con las cuentas sembradas (`recepcion@hotel.es` y `admin@hotel.es`) usando
su TOTP; las credenciales siguen solo en `~/.config/hotel-mcp/inject-data-output.txt` (permisos 600).

---

## 13. Actualización · incremento v3 (2026-09-26)

Menú de cuenta/wallet y sección Sistemas. Solo cambia la **web** (el `worker` y el `mcp` no varían:
no hay cambios de esquema).

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v3` (mismos `NEXT_PUBLIC_*` que v2) |
| Revisión | `hotel-mcp-web-00003-78m` al 100 %; worker/mcp siguen en `v2` |
| Configuración | Desplegado solo con `--image`, de modo que se **conservan** las 18 variables/secretos de la revisión anterior |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| Imagen | `…/web:v3` · 18 variables de entorno conservadas |
| Home / `/health/ready` | 200 · `READY` (postgres, redis y RPC `UP`) |
| `/admin/seguridad`, `/admin/sistemas` sin sesión | 200 (pantalla de acceso; el gate protege el contenido) |
| `/api/admin/system/users` y `/api/auth/password` sin sesión | **401** |
| Owner → `/api/admin/system/users` | **200**, 2 operadores, **sin** `passwordHash`/`totpSecretEnc` |
| Owner → `/api/admin/system/operations` | **200**, worker `ok`, `lag: 0` |
| Owner → `/api/admin/metrics` | 200 |
| Recepción → `/api/admin/system/users` y `/operations` | **403** |
| Recepción → `/api/reception/overview` | 200 (el incremento v2 sigue operativo) |

---

## 14. Actualización · F1–F5 (2026-09-27)

Se redesplegó la plataforma con las fases **F1 (Habitación), F2 (Front Office), F3 (Housekeeping),
F4 (Mantenimiento) y F5 (Actividades)** sin recrear infraestructura. Solo cambian **worker** y **web**;
`mcp` y `monitor` no varían (no tocan el esquema nuevo).

| Paso | Detalle |
|---|---|
| Imágenes | Cloud Build `worker:v4` (2m14s) y `web:v4` (3m03s), mismos `NEXT_PUBLIC_*` que v2/v3 (chainId 31337, contrato `0x70bD…605B`, bloque 288) |
| Revisiones | `hotel-mcp-worker-00003-852` y `hotel-mcp-web-00004-x5l` al 100 % de tráfico |
| Configuración | Desplegadas solo con `--image`, de modo que se **conservan** las variables y secretos de la revisión anterior |
| Migración | La aplica el **worker al arrancar** (`runMigrations`, idempotente y aditiva): crea las tablas del modelo (`rooms`, `room_images`, `room_publications`, `reservations`, `housekeeping_*`, `supply_*`, `maintenance_*`, `preventive_*`, `activities`, `activity_*`, `platform_settings`, `hotel_*`…) y relaja `additional_charges.token_id` a `NULL` (F5 · D-46) |
| Sin cambios de entorno | Las variables nuevas de F4 (`PREVENTIVE_HOUR_LOCAL`, `PREVENTIVE_CHECK_INTERVAL_MS`, `MAINTENANCE_ALERT_EMAIL`) tienen valor por defecto; sin destinatario, el aviso preventivo queda en el tablero del técnico y el planificador registra el motivo |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` de la web | **200** · `READY` (postgres, redis y RPC `UP`) |
| Home de la web | **200** · `<title>Hotel Marina del Sol</title>` (94 KB) |
| Rutas nuevas sin sesión | `/housekeeping`, `/mantenimiento`, `/admin/actividades`, `/admin/housekeeping/lenceria`, `/admin/mantenimiento/incidencias` y `/admin/mantenimiento/preventivo` → **200** (pantalla de acceso) |
| APIs nuevas sin sesión | `/api/housekeeping/shifts`, `/api/mantenimiento/board`, `/api/admin/actividades/activities`, `/api/admin/mantenimiento/plans` y `/api/admin/housekeeping/supplies` → **401** |
| Login + TOTP (owner) | **200** · sesión `admin@hotel.es` con `DEFAULT_ADMIN_ROLE` |
| F3 · `GET /api/housekeeping/shifts`, `/supplies` | **200** · 0 turnos; **4** artículos de lencería, **4** bajo umbral |
| F4 · `GET /api/mantenimiento/board` | **200** · 0 incidencias, 0 tareas vencidas, 0 bloqueos (esquema presente) |
| F5 · `GET /api/admin/actividades/activities` | **200** · catálogo vacío |
| **Escritura F5** | `POST` actividad `DEMO-F5` y su horario → **201**; la recepción lo ve (`/api/reception/actividades/schedules` → **1**); actividad desactivada |
| **Escritura F4** | `POST` plan preventivo `DEMO-F4` → **201**; aparece en `/api/admin/mantenimiento/plans` → **1**; plan desactivado |
| Regresión · `/api/nfts` (público) | **200** con las noches sembradas |
| `/health` de worker y mcp | **200** · worker `lag: 0` |

> Los registros `DEMO-F5` (actividad + horario) y `DEMO-F4` (plan preventivo) se crearon para probar
> las rutas de alta y quedaron **desactivados**; no hay borrado físico de catálogo por diseño.

### Pendiente del despliegue

- **Contrato sin recortar (F8)**: las imágenes llevan el código que llama a `registerRoom`/`publishRoom`
  del contrato canónico ampliado (F1), pero el contrato **desplegado en el Anvil global es el anterior**
  (`0x70bD…605B`, bloque 288). La **publicación de fichas desde `/admin/habitacion` requiere el corte
  de contrato de F8** (nuevo despliegue + siembra del registro de habitaciones); el resto de la
  plataforma no se ve afectado.
- El **mcp** y el **monitor** siguen con las imágenes de la primera entrega; conviene recompilarlos
  cuando F8 corte el contrato, para alinear ABIs y monitorización.

---

## 15. Actualización · navegación de suites (web:v5, 2026-09-27)

Incremento **solo de web** con los cambios de navegación **D-76** (la suite pública es el home del
proyecto) y **D-77** (el menú de Usuario ofrece los accesos a las suites según el rol). `worker`,
`mcp` y `monitor` no varían y **no se reconstruyen**; el **modelo de datos no cambia**.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v5` (3m47s, build `c7fbe51c…`) con los mismos `NEXT_PUBLIC_*` que v2–v4 (chainId 31337, contrato `0x70bD…605B`, bloque 288) |
| Revisión | `hotel-mcp-web-00005-szr` al 100 % de tráfico (sustituye a `00004-x5l`, que queda como rollback) |
| Configuración | Desplegada solo con `--image`, de modo que se **conservan** las variables y secretos de la revisión anterior |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` | **200** · `READY` (postgres, redis y RPC `UP`) |
| Home | **200** · `<title>Hotel Marina del Sol</title>` (94 KB) |
| Cabecera pública **D-76** | El HTML servido contiene la etiqueta **«Inicio»** de la primera entrada de navegación (1 coincidencia) |
| Rutas de suites | `/`, `/admin`, `/recepcion`, `/housekeeping` y `/mantenimiento` → **200** |
| APIs protegidas | `/api/housekeeping/shifts`, `/api/mantenimiento/board` y `/api/admin/actividades/activities` → **401** |
| Login + TOTP (owner) | **200** · `/api/auth/session` → `admin@hotel.es` con `DEFAULT_ADMIN_ROLE` (fuente de los cuatro accesos del menú, **D-77**) |
| Regresión F3/F4/F5 | `housekeeping/supplies` **4** artículos (4 bajo umbral), `mantenimiento/board` 200, `actividades` y `planes` con los registros de demostración |

> D-77 es **gating de vista**: cada suite revalida el rol en servidor (guard de API y gate de layout).
> El menú se pinta en cliente tras resolver la sesión, por eso la verificación E2E comprueba la
> **fuente** de la decisión (`/api/auth/session` con sus roles) y la asignación por rol está cubierta
> por pruebas unitarias (`suite-access.test.ts`, `wallet-menu-items.test.ts`).

---

## 16. Actualización · F6 Suite Pública (web:v6 + worker:v5, 2026-09-27)

Se redesplegó la plataforma con la **Suite Pública (F6.1–F6.4)** sin recrear infraestructura. A
diferencia de las entregas anteriores, **no es solo web**: F6.2 añadió la columna
`reviews.moderation_notes` por una migración idempotente que aplica el **worker al arrancar**, y el
worker desplegado (`v4`, F1–F5) era anterior a ese cambio. La web `v6` lee y escribe esa columna
(`ReviewsRepository`), así que **sin reconstruir el worker las reseñas y su lectura fallarían** con
«column moderation_notes does not exist». `mcp` y `monitor` no varían (no tocan el esquema nuevo).

| Paso | Detalle |
|---|---|
| Imágenes | Cloud Build `worker:v5` (2m32s, build `64d8cc7c…`) y `web:v6` (4m06s, build `33706397…`), con los mismos `NEXT_PUBLIC_*` que v2–v5 (chainId 31337, contrato `0x70bD…605B`, bloque 288, faucet `0xaB7B…5057`) |
| Revisiones | `hotel-mcp-worker-00004-pqp` y `hotel-mcp-web-00006-lns` al 100 % de tráfico |
| Configuración | Desplegadas solo con `--image`, de modo que se **conservan** las variables y secretos: **18** en web y **17** en worker |
| Migración | La aplica el **worker v5 al arrancar** (`runMigrations`, aditiva e idempotente): `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_notes VARCHAR(200)` (F6 · D-58). El arranque fue limpio (`/health` `ok`, `lag: 0`) |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` de la web | **200** · `READY` (postgres, redis y RPC `UP`) |
| `/health` de worker y mcp | **200** · worker `lag: 0` (bloque 313) · mcp bloque 313 |
| Home de la web | **200** · `<title>Hotel Marina del Sol</title>` (~102 KB) con «Inicio» (D-76), «Reservar» (D-65) y «Catálogo» |
| Rutas nuevas | `/catalogo`, `/reservar`, `/admin/contenido` y `/admin/resenas` → **200** |
| Regresión de rutas | `/admin`, `/recepcion`, `/housekeeping`, `/mantenimiento`, `/privacidad`, `/terminos` → **200** |
| APIs nuevas sin sesión | `/api/admin/content/images`, `/api/admin/content/offers` y `/api/admin/reviews` → **401**; `/api/public/rooms` → **200** |
| Login + TOTP (owner) | **200** · sesión `admin@hotel.es` con `DEFAULT_ADMIN_ROLE` |
| Owner · `/api/admin/content/images` y `/offers` | **200** · galería y planes vacíos (esquema presente) |
| Owner · `/api/admin/reviews` | **200** · **prueba la columna `moderation_notes`** (0 pendientes) |
| **Escritura F6.4** | `POST` plan `DEMO-F6` → **201**; listado **1**; `PATCH` activo→inactivo **200**; `DELETE` **200**; listado final **0** |
| Regresión de suites | `/api/housekeeping/shifts` y `/api/admin/actividades/activities` → **200** con owner |

> El registro `DEMO-F6` se creó para probar el alta y se **borró** al terminar; no queda contenido de
> demostración en la home.

### Rollback disponible

| Servicio | Revisión previa | Imagen |
|---|---|---|
| web | `hotel-mcp-web-00005-szr` | `web:v5` (navegación D-76/D-77) |
| worker | `hotel-mcp-worker-00003-852` | `worker:v4` (F1–F5) |

> **Ojo al rollback del worker**: `worker:v4` no conoce `reviews.moderation_notes`. Revertir el worker
> sin revertir la web a `v5` dejaría la web `v6` consultando una columna que ya existe (la migración es
> aditiva), así que el rollback seguro es **ambos** o solo la web.

### Pendiente (fuera de F6)

- **Corte de contrato de F8** (registro de habitaciones + siembra) y **F7** financiera (3.ª versión):
  el catálogo público (`/api/public/rooms`) queda vacío hasta publicar fichas y desplegar el contrato
  ampliado.
- El **mcp** y el **monitor** siguen con las imágenes de la primera entrega; conviene recompilarlos
  cuando F8 corte el contrato, para alinear ABIs y monitorización.

---

## 17. Actualización · preparación F8 (web:v7, 2026-09-27)

Incremento **solo de web** con el código **no destructivo** de F8 (partes 2, 4 y 5): siembra de
habitaciones y `registerRoom` en los scripts, y la **ventana global de acuñación** (endpoint + UI).
`worker`, `mcp` y `monitor` **no varían** (no hay cambios en `apps/worker` ni en el migrador; los
cambios de `packages/shared` son aditivos y no afectan al worker). **El corte de contrato de F8
(fases A–E del runbook) NO se ha ejecutado.**

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v7` (3m27s, build `b0f4fcb5…`), mismos `NEXT_PUBLIC_*` que v2–v6 (chainId 31337, contrato `0x70bD…605B`, bloque 288) |
| Revisión | `hotel-mcp-web-00007-9f5` al 100 % de tráfico (rollback: `00006-lns`, `web:v6`) |
| Configuración | Desplegada solo con `--image`: se **conservan** las 18 variables y secretos |
| Novedades | `GET /api/admin/rooms/[id]/mint-window` (owner) y la UI de la ventana en `/admin/habitacion` (primer acuñado al publicar + botón «Acuñar ventana» + aviso in-app), con i18n ES/EN/RU |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` y home | **200** · `READY` · `<title>Hotel Marina del Sol</title>` |
| Rutas | `/catalogo`, `/reservar`, `/admin`, `/admin/habitacion`, `/admin/contenido` → **200** |
| `/api/admin/rooms/<id>/mint-window` sin sesión | **401** |
| `/api/admin/rooms/<id>/mint-window` con owner (habitación inexistente) | **404** · `ROOM_NOT_FOUND` |
| Login + TOTP (owner) | **200** · `DEFAULT_ADMIN_ROLE` |
| Regresión F6 | `/api/admin/content/images`, `/api/admin/reviews`, `/api/housekeeping/shifts` y `/api/admin/actividades/activities` → **200** |

> **Estado de F8**: partes 1, 2, 4 y 5 hechas y desplegadas; la parte 3 (reset) y el corte global
> (fases A–E) siguen **pendientes y sin ejecutar**. Mientras el contrato desplegado sea el anterior,
> el registro dinámico (`registerRoom`/`publishRoom`) **no existe en cadena**: el anclaje de fichas
> queda *pendiente* y la tabla `rooms` sigue vacía (no hay habitaciones publicadas). El minteo por
> ventana, en cambio, funciona (el contrato antiguo no exige registro). El **barrido global de la
> ventana** y el **correo de agotamiento** también quedan pendientes.

---

## 18. Corte de contrato F8 ejecutado (2026-09-27)

Se ejecutó el **corte único de F8** (D-24) sobre el Anvil global y Cloud SQL, con el runbook y el
preflight de la preparación ([`F8-preflight.md`](./F8-preflight.md)). Resumen del estado final:

| Elemento | Antes | Después |
|---|---|---|
| Contrato | `0x70bD…605B` (bloque 288), **sin** registro dinámico | **`0xc66AB83418C20A65C3f8e83B3d11c8C3a6097b6F`** (bloque **314**) con `registerRoom`/`publishRoom` |
| Faucet | `0xaB7B…5057` | `0xdFdE6B33f13de2CA1A75A6F7169f50541B14f75b` (financiado con **1000 ETH**) |
| Registro de habitaciones | — | **50 habitaciones** registradas on-chain (`isRoomRegistered` = true) |
| `rooms` (BD) | 0 filas | **50 filas** sembradas desde el maestro (D-3/D-14) |
| Inventario | 18 noches | Reset (D-15) y **6 noches** sembradas + ancladas (`onChainAnchored: true`) |
| Imágenes | web:v7, worker:v5, mcp:v2, monitor:v1 | **web:f8, worker:f8, mcp:f8, monitor:f8** |
| Revisiones | web 00007, worker 00004, mcp 00002, monitor 00001 | **web 00008-vnh**, **worker 00005-v52**, **mcp 00003-sjj**, **monitor 00002-hn4** |

### Pasos ejecutados

1. **Respaldo** (obligatorio: los backups automáticos estaban **desactivados**):
   `gcloud sql backups create` → backup `1790542352281` (`SUCCESSFUL`).
2. **Contrato**: `forge script Deploy.s.sol:Deploy` con `DEPLOY_FAUCET=true`, `FAUCET_FUND_WEI=1000e18`
   contra el Anvil global + `pnpm sync` (registro `31337.json` → dirección/bloque/faucet nuevos).
3. **Imágenes**: 4 Cloud Builds en paralelo — `web:f8` (3m27s, `aea7456f…`), `worker:f8` (2m04s,
   `3b548830…`), `mcp:f8` (2m12s, `3ae0a667…`) y `monitor:f8` (1m52s, `25ef1b1d…`).
4. **Job de siembra** (`hotel-mcp-inject-data`) actualizado a `mcp:f8` y
   `CONTRACT_ADDRESS`/`DEPLOYMENT_BLOCK` nuevos. El **reset** (D-15) se ejecutó con el job en modo
   seco y luego `--apply`
   (`pnpm --filter @hotel/shared exec node --import tsx scripts/reset-index.ts`): antes
   `{nfts:18, ventas:0, historico:7, checkpoints:1, operadores:2}` → después
   `{nfts:0, ventas:0, historico:0, checkpoints:0, operadores:2}` (**operadores conservados**).
5. **Siembra**: `pnpm --filter @hotel/contracts inject:data` → 50 `registerRoom` + minteo (paso 3.5).
6. **Redespliegue**: `70-deploy-apps.sh` con `GCP_IMAGE_TAG=f8` (worker, mcp, web) y el monitor por
   **API REST v2** (`gcloud run worker-pools deploy` fallaba por el módulo Python `grpc` ausente; se
   actualizó con un `PATCH` a `workerPools/hotel-mcp-monitor` conservando el entorno).

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `isRoomRegistered(101)` / `(220)` en el contrato nuevo | **true** / **true** |
| `roomTypeOf(116)` | `doble` |
| `publishRoom(101, 0x1111…)` | tx `0x8d8579…` OK · `publicationHashOf(101)` = huella |
| `GET /api/admin/rooms` (owner) | **50** habitaciones (`101 SIMPLE DRAFT`, `baseRateWei` 0.05 ETH) |
| `GET /api/admin/rooms/<id>/mint-window` (owner) | **`windowDays: 90`**, 89 noches ausentes, `canMint:false` (DRAFT) |
| `/api/nfts` | **6** noches, `onChainAnchored: true` |
| `/api/public/rooms` | 0 (ninguna ficha publicada aún: las 50 están `DRAFT`) |
| `/health/ready` web · mcp `/health` | **200 READY** · `ok` |
| Worker `/health` | `lag: 0`, `processingDegraded: false`, `emailDegraded: **true**` |

> **`emailDegraded: true` (aviso)**: el worker se marca degradado al agotar los reintentos SMTP. El
> entorno usa el SMTP de relleno `SMTP_HOST=smtp.invalid` (heredado del despliegue), así que los
> correos de aviso de venta de la siembra no se entregan. **No es un fallo del corte**: el pipeline
> (`lag: 0`) y el procesamiento están sanos; desaparecerá en cuanto se configure un SMTP real.

### Rollback

| Servicio | Revisión de vuelta | Imagen |
|---|---|---|
| web | `hotel-mcp-web-00007-9f5` | `web:v7` |
| worker | `hotel-mcp-worker-00004-pqp` | `worker:v5` |
| mcp | `hotel-mcp-mcp-00002-j4r` | `mcp:v2` |
| monitor | `hotel-mcp-monitor-00001-rbw` | `monitor:v1` |

- **Contrato**: restaurar `packages/shared/deployments/31337.json` a `0x70bD…605B`/bloque 288.
- **BD**: restaurar desde el backup `1790542352281` (destructivo; coordinar).

### E2E de publicación y ventana de acuñación (prueba temporal, 2026-09-27)

Para validar el **criterio de salida de F8** se publicó **una** ficha (habitación 101) de punta a
punta y se ejecutó su primer acuñado de ventana; después se **revirtió**:

1. Subida de `sencilla_hotel.jpg` (444 KB) → `101-Simple-2026-09-27-1.jpg` (portada).
2. `GET /publish` → huella `0xcf1d2e2e…638e`; firma **EIP-191** de la huella por la cuenta 0
   (`verifyMessage` = true) y `publishRoom(101, huella)` → tx `0xaa19f8d7…b891`.
3. `POST /publish` con TOTP → habitación **`PUBLISHED`** con `onChainAnchored: true`;
   `publicationHashOf(101)` = huella.
4. **Primer acuñado de la ventana (D-4)**: `GET /mint-window` → 90 días, 89 noches ausentes;
   acuñadas 89 (28-sep → 26-dic) → **95 eventos `Mint`** en total (6 de la siembra + 89).
   El worker quedó `lag: 0` e indexó las noches (`/api/nfts`, paginado a 20 por página).
5. **Reversión**: `PATCH` a `DRAFT` + borrado de la imagen → `POST /api/public/rooms` vuelve a **0**.

> La prueba no deja contenido público: la ficha está en borrador. En cadena permanece la huella de
> publicación y las 90 noches de la habitación 101 (idempotentes y reutilizables al publicar de
> nuevo).

### Pendiente tras el corte

- **Publicar las 50 fichas** (están `DRAFT`): requieren descripción ES definitiva e imagen; al
  publicar se anclan (`publishRoom`) y el **primer acuñado de la ventana** se dispara (D-4).
- **SMTP real** para cerrar `emailDegraded`.
- **Cerrado en código el 2026-09-27** (no requiere redespliegue del corte, entra en la próxima imagen):
  el **barrido global** de la ventana y el **aviso de agotamiento** (in-app + correo por la cola
  única), con su banco de pruebas real `pnpm test:e2e:f8` sobre Anvil desechable
  (`F8-ventana-acunado.md` §5, `F8-runbook.md` §10).

---

## 19. Release `v9` — ciclo de imagen visual aplicado al producto (2026-09-28)

**Qué se desplegó.** Las cuatro imágenes `v9`, construidas con Cloud Build desde el árbol publicado
(7 commits del ciclo visual + el parche de build) y desplegadas **solo con `--image`**, conservando
las variables y secretos de cada revisión. **No** se tocó el contrato, ni la base de datos, ni se
ejecutó ningún reset/siembra: el corte de F8 (contrato `0xc66A…7b6F`, bloque 314) sigue vigente.

| Componente | Imagen | Revisión | Verificación |
|---|---|---|---|
| `hotel-mcp-web` | `web:v9` | `hotel-mcp-web-00009-76r` (100 %) | `/health/ready` → **READY** (postgres, redis y cadena `UP`); `/` 200 con **hero (`bg-ocean/65`)** y **barra de reserva**; `/catalogo` y `/reventa` 200 |
| `hotel-mcp-worker` | `worker:v9` | `hotel-mcp-worker-00007-scm` (100 %) | `/health` con `lag 0` y `aggregateLag 0`; **`planificador de ventana de acuñación activo`** (el aviso de agotamiento de F8 entra por primera vez en producción), junto a los de retención y preventivo; `/aggregates` con datos reales (97 noches, 6 vendidas) |
| `hotel-mcp-mcp` | `mcp:v9` | `hotel-mcp-mcp-00004-bl7` (100 %) | `/health` → `ok`, bloque al día |
| `hotel-mcp-monitor` | `monitor:v9` | worker pool actualizado | imagen y **8 variables/secretos conservados** (REST v2: `gcloud run worker-pools update` falla en este SDK por el módulo `grpc` ausente) |

**Imagen social verificada en producción**: `/opengraph-image` → **200 `image/png`, PNG válido
1200×630 (105 KB)** y el `<head>` publica `og:image` con el **dominio de producción** (no
`localhost`), gracias a la nueva `NEXT_PUBLIC_SITE_URL` inyectada en el **build** de la web.

**Arreglo de entorno encontrado al desplegar (defecto previo, no del release).** El worker **no tenía
`CHECKIN_SECRET_KEY`** (la web sí): su listener fallaba al consolidar los eventos `CheckedIn` con
`Secreto obligatorio no configurado: CHECKIN_SECRET_KEY`. Se añadió el secreto de Secret Manager
(`hotel-checkin-secret-key`) a la revisión `00007-scm`; **los fallos cesaron** (verificado en los logs
por ventana temporal). Sin esto, el índice off-chain no marcaba como consumidas las noches del
check-in.

**Estado esperado que NO es una avería.** `/health` del worker devuelve `status: down` con
`emailDegraded: true` porque el SMTP desplegado es el **de relleno** (`smtp.invalid`), el mismo
invariante documentado en el corte de F8: el correo queda `PENDING` y la reconciliación lo reintenta.
Se cierra con credenciales SMTP reales (pendiente del cliente), como las **50 fichas en `DRAFT`**.

**Rollback.** Las revisiones anteriores siguen disponibles y sin tráfico:
`hotel-mcp-web-00008-vnh` (`web:f8`), `hotel-mcp-worker-00006-pvh`/`00005-v52` (`worker:v9`/`f8`),
`hotel-mcp-mcp-00003-sjj` (`mcp:f8`) y `monitor:f8`. Volver atrás es
`gcloud run services update-traffic <servicio> --to-revisions=<revisión>=100`.

**Instrumentos añadidos al repositorio.** `infra/gcp/deploy-monitor.sh` (actualización segura del
worker pool por REST v2, con el array de contenedores completo para no perder entorno ni secretos) y
`GCP_WEB_URL`/`GCP_MONITOR_POOL` en `infra/gcp/gcp-env.sh`.

> **Nota de proceso**: `infra/gcp/f8-build-images.sh` construye las 4 imágenes de una release tomando
> dirección, bloque y faucet del **registro de despliegue vigente**; para esta release se ejecutó con
> `--tag=v9 --execute`, sin pasar por las fases destructivas de `f8-cut.sh`.

---

## 20. Release `v10` — suite pública completa en producción (2026-09-29)

**Qué se desplegó.** Release **solo de web**: los dos commits posteriores a `v9` (`dfd8aaf`
renombrado canónico de imágenes y `638b73f` suite pública de 9 páginas + cierre de las suites de
personal) tocan **únicamente `apps/web/` y documentación**; `packages/`, migraciones, contrato y
`Dockerfile` no varían. `worker`, `mcp` y `monitor` **no se reconstruyen** y siguen en `v9`, con el
mismo criterio que la release web-only de §15. **No** se tocó contrato (sigue `0xc66A…7b6F`, bloque
314), ni base de datos, ni se ejecutó siembra o reset.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v10` (4m11s, build `d2c739e9-3746-4eb1-8b4d-9a053c8bf808`) con los mismos `NEXT_PUBLIC_*` de v2–v9 (chainId 31337, contrato `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`, bloque 314, faucet `0xdFdE…f75b`, `NEXT_PUBLIC_SITE_URL` de producción) |
| Revisión | `hotel-mcp-web-00010-kvr` al 100 % de tráfico (sustituye a `00009-76r`, que queda como rollback) |
| Configuración | Desplegada **solo con `--image`**: se conservan las **18** variables de entorno y los **9** secretos de la revisión anterior |
| Componentes intactos | `hotel-mcp-worker-00007-scm` (`worker:v9`), `hotel-mcp-mcp-00004-bl7` (`mcp:v9`) y worker pool `hotel-mcp-monitor` (`monitor:v9`) |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` (antes del despliegue) | **69 ficheros · 524 pruebas** en verde |
| `/health/ready` | **200** · `READY` (postgres, redis y `polygonRPC` **UP**) |
| Home | **200** (133 KB) · `<title>Hotel Marina del Sol</title>` |
| **9 páginas nuevas** | `/empresa`, `/instalaciones`, `/habitaciones`, `/servicios`, `/experiencias`, `/actividades`, `/planes`, `/resenas` y `/contacto` → **200** con su `<title>` propio (100–117 KB) y contenido real (p. ej. `/habitaciones` nombra Simple, Doble y Suite) |
| Navegación nueva | El HTML de la home enlaza las **9** rutas de sección (`SiteHeader` + pie) |
| Imagen social | `/opengraph-image` → **200 `image/png`, PNG válido 1200×630 (106 KB)** y `og:image` con el dominio de producción |
| Regresión de rutas | `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/admin`, `/recepcion`, `/housekeeping`, `/mantenimiento`, `/asistente`, `/ayuda`, `/checkin`, `/historico`, `/privacidad` y `/terminos` → **200** |
| APIs protegidas | `/api/housekeeping/shifts`, `/api/mantenimiento/board` y `/api/admin/actividades/activities` → **401** |
| Worker / MCP (v9, sin cambios) | worker `/health` con `lag 0` y `aggregateLag 0` (bloque 478); mcp `/health` → `ok` (bloque 478) |

**Estado esperado que NO es una avería.** El worker sigue devolviendo `status: down` con
`emailDegraded: true` por el SMTP de relleno (`smtp.invalid`), el mismo invariante documentado en §19;
`processingDegraded` es `false`.

**Rollback.** La revisión anterior sigue disponible y sin tráfico:
`gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00009-76r=100`.
`worker`, `mcp` y `monitor` no se tocaron, así que no requieren acción.

> **Nota de proceso (desbloquea el pendiente nº 3 de `estado_proyecto.md`).** El `gcloud` del snap
> (`/snap/bin/gcloud`) **no es utilizable** en este entorno («snap-confine … cap_dac_override»). El
> SDK instalado en el home sí lo es: **`/home/dsh/google-cloud-sdk/bin/gcloud`** (582.0.0, cuenta
> `anlucorporations@gmail.com`, config `hotel-mcp`). Los scripts de `infra/gcp/` siguen invocando
> `gcloud` por `PATH`, así que en este entorno hay que ejecutarlos con
> `PATH="$HOME/google-cloud-sdk/bin:$PATH"` delante.

---

## 21. Release `v11` — manuales por caso de uso y back-office AdminLTE (2026-09-29)

**Qué se desplegó.** Release **solo de web**: los dos commits de la release (`f53dd9b` manuales por
caso de uso y `5f76ba3` shell AdminLTE D-78) tocan `apps/web/`, `docs/` y `RepoTecnico/`, pero **no**
`packages/`, migraciones ni contrato. `worker`, `mcp` y `monitor` **no se reconstruyen** y siguen en
`v9` (mismo criterio web-only de §15 y §20). No se tocó contrato (`0xc66A…7b6F`, bloque 314), ni base
de datos, ni se ejecutó siembra o reset.

| Paso | Detalle |
|---|---|
| Push | `638b73f..5f76ba3` en los tres remotos (`origin` gitlab.com, `github`, `codecrypto`) |
| Imagen | Cloud Build `web:v11` (2m47s, build `33823f18-98a5-413d-8796-99734f542208`) con los mismos `NEXT_PUBLIC_*` de v2–v10 (chainId 31337, contrato `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`, bloque 314, faucet `0xdFdE…f75b`, `NEXT_PUBLIC_SITE_URL` de producción) |
| Revisión | `hotel-mcp-web-00011-xvb` al 100 % de tráfico (sustituye a `00010-kvr`, que queda como rollback) |
| Configuración | Desplegada **solo con `--image`**: se conservan las **18** variables de entorno y los **9** secretos |
| Componentes intactos | `hotel-mcp-worker` (`worker:v9`) y `hotel-mcp-mcp` (`mcp:v9`) |

### Qué entra en la release

- **32 manuales por caso de uso** (técnicos en `RepoTecnico/Manuales/05-casos-de-uso/` y literales en
  `docs/Manuales/05-casos-de-uso/`) en 9 bloques ordenados por la **iniciación del sistema**, con
  **32 infografías** SVG y el **mapa de iniciación**; `manuals.generated.ts` pasa a **35 manuales** y
  `/ayuda` los agrupa por bloque (i18n ES/EN/RU). `docs/pdf/` y `apps/web/public/manual/` regenerados.
- **Back-office AdminLTE (D-78/D-79)**: sidebar izquierda plegable, navbar, migas de pan derivadas de
  la ruta y `admin-shell.test.ts`.

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` (antes del despliegue) | **70 ficheros · 537 pruebas** en verde |
| Guardianes de manuales e imágenes | `manuals-sync` + `images-naming` → **14/14** |
| `/health/ready` | **200** · `READY` (postgres, redis y `polygonRPC` **UP**) |
| Home | **200** (134 KB) |
| `/ayuda` | **200** (214 KB) con las **32** tarjetas de caso de uso, los 9 bloques y el mapa |
| `/ayuda/cu-16-roles` | **200** con el texto del manual y la infografía embebida |
| `/manual/manual-cu-16-roles.pdf` | **200 `application/pdf`** (106 KB) |
| `/manual/imagenes/doc-cu-16-roles.svg` · `doc-mapa-iniciacion-sistema.svg` | **200 `image/svg+xml`** |
| 9 páginas de la suite pública | `/empresa`, `/instalaciones`, `/habitaciones`, `/servicios`, `/experiencias`, `/actividades`, `/planes`, `/resenas`, `/contacto` → **200** |
| Regresión de rutas | `/catalogo`, `/reventa`, `/mis-noches`, `/admin`, `/recepcion`, `/housekeeping`, `/mantenimiento`, `/asistente`, `/checkin`, `/historico`, `/privacidad` → **200** |
| APIs protegidas | `/api/reception/overview`, `/api/housekeeping/shifts`, `/api/mantenimiento/board` y `/api/admin/actividades/activities` → **401** |
| Worker / MCP (v9, sin cambios) | worker `/health` con `lag 0` y `aggregateLag 0` (bloque 478); mcp `/health` → `ok` (bloque 478) |

**Corrección de la traza de §20**: la API protegida de actividades es
`/api/admin/actividades/activities` (en español); la ruta en inglés (`/api/admin/activities/...`)
devuelve **404**.

**Estado esperado que NO es una avería.** El worker sigue devolviendo `status: down` con
`emailDegraded: true` por el SMTP de relleno (`smtp.invalid`), el mismo invariante de §19 y §20;
`processingDegraded` es `false`.

**Rollback.** La revisión anterior sigue disponible y sin tráfico:
`gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00010-kvr=100`.
`worker`, `mcp` y `monitor` no se tocaron, así que no requieren acción.

---

## 22. Release `v12` — reparto de las barras del back-office (D-80/D-81) (2026-09-29)

**Qué se desplegó.** Release **solo de web**: el commit `095b8cd` toca `apps/web/` y `RepoTecnico/`,
pero **no** `packages/`, migraciones ni contrato. `worker`, `mcp` y `monitor` **no se reconstruyen** y
siguen en `v9`. No se tocó contrato (`0xc66A…7b6F`, bloque 314), ni base de datos, ni se ejecutó
siembra o reset.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v12` (3m21s, build `a1381ad3-be3b-4aca-bb62-846c30bfb43d`) con los mismos `NEXT_PUBLIC_*` de v2–v11 (chainId 31337, contrato `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`, bloque 314, faucet `0xdFdE…f75b`, `NEXT_PUBLIC_SITE_URL` de producción) |
| Revisión | `hotel-mcp-web-00012-wpl` al 100 % de tráfico (sustituye a `00011-xvb`, que queda como rollback) |
| Configuración | Desplegada **solo con `--image`**: conservadas las **18** variables y los **9** secretos |
| Push previo | `095b8cd` subido a los tres remotos de `anlucorporations` (rama `Hotel-DSH-GCP`) |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` | **200** · `READY` (postgres, redis y `polygonRPC` **UP**) |
| Home | **200** (134 KB) · `<title>Hotel Marina del Sol</title>` |
| `/ayuda` (destino único de la nueva barra superior) | **200** (214 KB) |
| Regresión pública | 16 rutas (`/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/habitaciones`, `/empresa`, `/contacto`, `/resenas`, `/planes`, `/servicios`, `/experiencias`, `/actividades`, `/instalaciones`, `/historico`, `/asistente`, `/checkin`) → **200** |
| Suites sin sesión | `/admin/dashboard`, `/recepcion`, `/housekeeping`, `/mantenimiento` → **200** con la pantalla de acceso; **0 coincidencias** de los marcadores del panel (`metric-primary-volume`, `ChartFigure`) en el HTML |
| APIs protegidas | `/api/housekeeping/shifts`, `/api/mantenimiento/board`, `/api/admin/actividades/activities` y `/api/auth/session` → **401** |
| Imagen social | `/opengraph-image` → **200 `image/png`, PNG válido 1200×630 (106 KB)** |
| Worker / MCP (v9, intactos) | worker `lag 0` y `aggregateLag 0` (bloque 478); mcp `ok` (bloque 478) |

**Estado esperado que NO es una avería.** El worker sigue devolviendo `status: down` con
`emailDegraded: true` por el SMTP de relleno (`smtp.invalid`); `processingDegraded` es `false`
(mismo invariante que §19–§21).

**Hallazgo de esta verificación (defecto previo, no de `v12`).** Al pedir `/admin/dashboard` **sin
sesión**, el HTML servido **no contiene ninguna marca del shell nuevo** (`admin-sidebar`,
`admin-nav-toggle`, `admin-help-link`, `nav-section-administracion`): el gate RSC devuelve
`AdminSignInScreen`, que tiene **su propia plantilla** (header con `WalletBar`) y no pasa por
`AdminLayout`. Es decir, **el rediseño D-78/D-80/D-81 solo se ve con sesión iniciada**; la pantalla
de acceso —y las cuatro suites que la reutilizan: `/admin`, `/recepcion`, `/housekeeping`,
`/mantenimiento`— conserva la distribución anterior. Confirmado leyendo el código: siete ficheros
importan `AdminSignInScreen`. Corregido en **D-82** (§23): `AdminLayout`
acepta el prop `gate` y el acceso se compone bajo la misma plantilla; queda pendiente decidir la
plantilla del acceso en las suites de personal.

**Rollback.** La revisión anterior sigue disponible y sin tráfico:
`gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00011-xvb=100`.
`worker`, `mcp` y `monitor` no se tocaron.

---

## 23. Release `v13` — acceso del back-office bajo la misma plantilla (D-82) (2026-09-30)

**Qué se corrigió.** El hallazgo de §22: `/admin/dashboard` **sin sesión** devolvía un HTML sin ninguna
marca del shell AdminLTE porque `AdminSignInScreen` pintaba su propia plantilla y no pasaba por
`AdminLayout`. La seguridad era correcta (gate RSC + cero marcadores de panel); lo roto era la
**distribución partida en dos plantillas**.

| Cambio | Detalle |
|---|---|
| `AdminLayout.tsx` | Nuevo prop `gate?: boolean`; con `gate` se renderiza el `shell` con `SignInGate` como contenido. Sidebar y migas siguen condicionados a `hasSession` (sin sesión no hay navegación que mostrar) |
| `AdminSignInScreen.tsx` | Deja de tener plantilla propia (70 líneas → envoltorio mínimo): delega en `<AdminLayout gate>` y conserva el `router.refresh()` del gate. Retirado el `WalletBar` del acceso (sin sesión no hay nada que firmar; la billetera vive en el bloque de sesión, D-81) |
| Suites de personal | **No unificadas a propósito**: van dentro de `PublicShell`, que ya aporta cabecera y `<main id="contenido">`; anidar `AdminLayout` produciría dos `<header>`, dos `<main>` y dos pies (regresión de landmarks). Queda pendiente decidir su pantalla de acceso |
| Guardianes | `admin-shell.test.ts` **23 → 27** pruebas y `admin-auth-guardian.test.ts` **4 → 5**, con tres sondas de falsificación (plantilla propia recuperada, rama `gate` neutralizada, sidebar pintado sin sesión) |

**Verificación local.** `pnpm --filter @hotel/web test` **70 ficheros · 552 pruebas**; `typecheck` OK;
`lint` 0 errores en los ficheros tocados; `build` OK (**52** páginas, **84** API). En local **no** era
posible comprobar el HTML servido (sin servidor PostgreSQL en el host), así que esa comprobación se
hizo **contra producción** al desplegar, que es donde el gate responde de verdad.

### Despliegue ejecutado (2026-09-30)

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v13` (4m39s, build `fe95ac54-a87e-49f6-af98-a9159cc5fd63`) con los mismos `NEXT_PUBLIC_*` de v2–v12 (contrato `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`, bloque 314) |
| Revisión | `hotel-mcp-web-00013-vjh` al 100 % (rollback disponible: `00012-wpl`) |
| Configuración | **Solo con `--image`**: conservadas las **18** variables y los **9** secretos |
| Sin cambios | `worker:v9`, `mcp:v9` y `monitor:v9`; contrato, base de datos y siembra intactos |

### Verificación en producción (la que faltaba en §22)

| Comprobación | Resultado |
|---|---|
| `/health/ready` | **200** · `READY` (postgres, redis y `polygonRPC` **UP**) |
| **`/admin/dashboard` sin sesión** | **200** (92 KB) · el HTML **ya contiene la plantilla del shell**: `admin-sidebar`, `admin-nav-toggle`, `admin-help-link` y el pie «Panel de administración» presentes; `<h1>` canónico D-04; **cero** marcadores de panel (`metric-primary-volume`, `ChartFigure`) ⇒ **hallazgo de §22 cerrado con evidencia de tráfico real** |
| Regresión pública | 18 rutas (`/`, catálogo, reserva, reventa, mis noches, las 9 de sección, histórico, asistente, check-in, ayuda) → **200** |
| Suites de personal sin sesión | `/recepcion`, `/housekeeping`, `/mantenimiento` → **200**, puerta correcta y sin panel |
| APIs protegidas | `/api/housekeeping/shifts`, `/api/mantenimiento/board`, `/api/admin/actividades/activities`, `/api/auth/session` → **401** |
| Imagen social | `/opengraph-image` → **200 `image/png`**, PNG válido **1200×630** |
| Worker / MCP (v9) | worker `lag 0` y `aggregateLag 0` (bloque 479); mcp `ok` (bloque 479). El `status: down` con `emailDegraded: true` sigue siendo el SMTP de relleno (§19–§22) |

**Efecto colateral detectado al verificar (y su estado).** Las tres suites de personal reutilizan
`AdminSignInScreen`, así que desde D-82 su pantalla de acceso **también** se sirve bajo la plantilla
del **back-office**: muestran la marca y el título de Administración
(`admin.gateTitle` = «Back-office · acceso con contraseña y TOTP») en lugar del suyo
(`reception.gateTitle` = «Acceso de recepción»). No es un fallo de seguridad —la puerta y el rol exigido
siguen siendo los de cada suite— pero sí una confusión de ámbito. Queda fijado en código con una prueba
en `public-suite.test.ts` («el acceso sin sesión de las suites de personal usa aún el acceso genérico»)
y pendiente de decisión de producto: dar a `AdminSignInScreen` una variante por suite (título y
plantilla propios) o aceptar el acceso unificado.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00012-wpl=100`.

---

*Despliegue GCP · hotelMCP · actualizado 2026-09-30 (release `v13`: acceso del back-office unificado, D-82)*
---

## 24. Release `v14` — worker con el índice SOLD corregido + web con el catálogo endurecido (§35) (2026-09-30)

**Qué se desplegó.** Cierre del pendiente operativo nº 1 de §35 y del nº 3 de §29. Dos servicios:

| Paso | Detalle |
|---|---|
| Imagen `worker:v14` | Cloud Build (build `c29cd8ba-273c-4ba4-90a3-9c47323a7bcd`, 2m46s), fuente local en el commit §35 |
| Revisión worker | `hotel-mcp-worker-00008-fnt` al 100 % (anterior: `00007-scm` con `worker:v9`) |
| Imagen `web:v14` | Cloud Build (build `79de2c1c-0f68-4312-b9b3-a5b81e66401f`, 3m59s) con los mismos `NEXT_PUBLIC_*` de v2–v13 (chainId 31337, contrato `0xc66a…7b6F`, bloque 314, faucet `0xdFdE…f75b`, `NEXT_PUBLIC_SITE_URL=https://hotelmarinadelsol.es`) |
| Revisión web | `hotel-mcp-web-00014-sn9` al 100 % (rollback: `00013-vjh`) |
| Configuración | Ambos desplegados **solo con `--image`** (`services update` + `--no-traffic` → verificación de entorno → `update-traffic`): **18/18 variables conservadas, cero cambiadas** (comparado revisión a revisión vía `run revisions describe --format json`) |
| Sin cambios | `mcp:v9` y `monitor:v9`; contrato, base de datos y siembra intactos |
| Push | El commit §35 queda **local** (sin push a remotos, por decisión del responsable); la imagen se construyó desde esa fuente |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| Logs del worker tras el arranque | catch-up completo desde el bloque 314: **7 eventos `NFTSold` consolidados** (los 6 vendidos + la reventa) — exactamente lo que la `v9` no había escrito en el índice |
| Catálogo `/catalogo` | HTTP 200 · **87 noches disponibles** · **cero** de los 6 tokenIds vendidos (`10120261027`, `10820261103`, `11820261110`, `12420261117`, `20220261124`, `21020261201`) — el error §35 ya no es reproducible desde el catálogo |
| Worker `/health` | `lag 0`, `aggregateLag 0`, head 479; `emailDegraded: true` sigue siendo el SMTP de relleno (§19–§23, no es avería) |
| `/aggregates` | `soldCount: 6`, `mintedCount: 98`, coherente con la cadena |
| Web `/health/ready` | **200** · READY (postgres, redis, polygonRPC UP) |
| Regresión pública | `/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico`, `/contacto`, `/planes` → **200** |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00013-vjh=100` y
`gcloud run services update-traffic hotel-mcp-worker --project hotel-mcp --region europe-west1 --to-revisions=hotel-mcp-worker-00007-scm=100`.

**Nota operativa.** El binario `gcloud` del snap fallaba (`snap-confine … cap_dac_override`) pero
`/snap/google-cloud-cli/current/bin/gcloud` con `CLOUDSDK_CONFIG=~/.config/gcloud` funciona sin
elevación: sustituye al camino «gcloud no es utilizable» declarado en §29 y §35.


---

## 25. Release `v14` COMPLETA — las cuatro imágenes al día (mcp y monitor incluidos) (2026-09-30)

**Petición del responsable**: `/push` y desplegar la última versión en GCP. El push se ejecutó a los
tres remotos de `anlucorporations` (`codecrypto`, `github`, `origin`): `7a263b6..ecd94ab` en la rama
`Hotel-DSH-GCP`. §24 había dejado web y worker en `v14`; mcp y monitor seguían en `v9` (su código no
cambió —el diff contra el commit de v13 está vacío en `apps/mcp` y `packages/shared`—, pero la release
queda uniforme).

| Paso | Detalle |
|---|---|
| Imagen `mcp:v14` | Cloud Build (build `9b454d9b-0280-4767-8ac0-6bf87ecfafd1`, 2m30s), fuente local = lo mismo que se subió a los remotos |
| Revisión mcp | `hotel-mcp-mcp-00005-tnl` al 100 % (rollback: `00004-bl7`) · **8/8 variables conservadas**, cero cambiadas (comparado revisión a revisión) |
| Imagen `monitor:v14` | Cloud Build (build `73a0e863-8aa7-4e5b-ac5c-539b3dd05f38`, 2m7s) |
| Worker pool del monitor | `bash infra/gcp/deploy-monitor.sh …/monitor:v14` con `PATH=/snap/google-cloud-cli/current/bin:$PATH` (el envoltorio del snap sigue roto; el binario directo funciona): HTTP 200, imagen actualizada, **8 env/secretos conservados** |
| Contrato / BD / siembra | intactos (`0xc66A…7b6F`, bloque 314) |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| Web `/health/ready` | **200** · READY (postgres, redis, polygonRPC UP) |
| Worker `/health` | `lag 0`, `aggregateLag 0`, head 479 (`emailDegraded` = SMTP de relleno, §19–§24) |
| MCP `/health` | `ok`, bloque 479 |
| Imágenes servidas | web `v14` · worker `v14` · mcp `v14` · monitor `v14` |
| Regresión pública | `/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico` → **200** |
| Catálogo sin fantasmas | **0** coincidencias de los 6 tokenIds vendidos (§35) |

**Rollback.** mcp: `gcloud run services update-traffic hotel-mcp-mcp --to-revisions=hotel-mcp-mcp-00004-bl7=100`;
monitor: volver a ejecutar `deploy-monitor.sh` con `monitor:v9`; web/worker: las revisiones de §24.

---

## 26. Releases `v15` y `v16` — F9 (integridad catálogo ↔ cadena): dos hallazgos operativos (2026-10-01)

**Qué se desplegó.** La release **F9** (`ecbbb8c`/`9dd0d62`): el catálogo contrasta el índice con el
registro de ventas y retira las noches ya vendidas, con aviso honesto cuando oculta inventario. Toca
`packages/shared` (dominio + repositorio) y la web, pero la API nueva **solo la consume el catálogo**
(verificado por búsqueda): `worker`, `mcp` y `monitor` siguen en `v14`.

### Hallazgo 1 · El tráfico estaba **fijado por nombre**, así que `--image` no tenía efecto

El primer despliegue (`web:v15`, build `69ae6b02`, 3m38s) creó la revisión `00015-jhk`, **pero Cloud Run
la retiró 32 s después** («Revision retired») y el tráfico siguió en `00014-sn9`. Causa: la
configuración deseada del servicio tenía `spec.traffic` **fijado a una revisión concreta por nombre**:

```
[ { "percent": 100, "revisionName": "hotel-mcp-web-00014-sn9" } ]
```

Con tráfico fijado por nombre, `gcloud run deploy --image` actualiza la plantilla pero **no** mueve el
tráfico; la revisión nueva queda sin tráfico y Cloud Run la retira. La imagen del template sí quedaba
en `v15`, lo que hacía el estado especialmente engañoso (el `describe` decía `v15` mientras el tráfico
servía `v14`).

**Procedimiento corregido (usado ya en `v16` y recomendado en adelante):**

```bash
# 1) crear la revisión SIN tráfico y con etiqueta (así no se retira y tiene URL propia de canario)
gcloud run deploy hotel-mcp-web --image=<img> --no-traffic --tag=<tag>
# 2) verificar el canario en https://<tag>---<servicio>-<hash>.run.app
# 3) mover el tráfico cuando el canario está verde
gcloud run services update-traffic hotel-mcp-web --to-revisions=<revisión>=100
```

`--to-latest` **no existe** en este SDK para `gcloud run deploy` (sí en `update-traffic`), así que el
paso 3 se hace por nombre de revisión.

### Hallazgo 2 · La consulta nueva era **SQL inválido** y la capa F9 quedaba inerte en producción

Con `v15` sirviendo, los logs de `00017-hoh` mostraban en **cada** petición del catálogo:

```
[fetchCatalog] Fallback a escaneo RPC: error: for SELECT DISTINCT, ORDER BY expressions must appear in select list
  routine: 'transformDistinctClause'
```

`listGhostPrimarySales` usaba `SELECT DISTINCT … ORDER BY se.token_id::NUMERIC`, y PostgreSQL rechaza
ordenar por una **expresión** que no está en la lista de selección cuando hay `DISTINCT`. Consecuencia
real: la excepción hacía que `fetchCatalog` cayera a su **respaldo por RPC en cada petición**, la capa
estructural F9 no se ejecutaba nunca y el aviso de sincronización era inalcanzable.

**Por qué no lo detectaron las pruebas:** el doble del pool está mockeado (**un mock no valida SQL**);
las aserciones comprobaban subcadenas, no sintaxis. **Corrección**: `GROUP BY se.token_id` (deduplica
igual y admite expresiones en el `ORDER BY`), más un guardián que prohíbe la forma `DISTINCT` en esa
consulta. La sintaxis se validó además contra un **motor PostgreSQL real** (PGlite, PostgreSQL 18.3
compilado a WASM) con un caso de cada tipo, y esa misma prueba **reprodujo el rechazo** de la forma
antigua.

### Estado final (verificado)

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v16` (4m51s, build `35f944ef`), con los mismos `NEXT_PUBLIC_*` (contrato `0xc66A…7b6F`, bloque 314) |
| Revisión | `hotel-mcp-web-00019-jef` (**tag `v16`**) al **100 %** del tráfico |
| Configuración | Solo con `--image` + `--no-traffic` + `update-traffic`: **18 variables y 9 secretos** conservados |
| Sin cambios | `worker:v14`, `mcp:v14`, `monitor:v14`; contrato, base de datos y siembra intactos |

| Comprobación | Resultado |
|---|---|
| Canario `v16` **antes** de mover tráfico | `/health/ready` **200 READY**; `/catalogo` **200**; aviso renderizado **0** (sin fantasmas); **logs sin el error de SQL ni respaldo RPC** |
| Logs de `v15` (comparativa) | El error `DISTINCT` aparecía en cada petición (`transformDistinctClause`) |
| Producción en `v16` | `/health/ready` **READY** (postgres/redis/polygonRPC UP); `/catalogo` **200** y aviso **0**; logs limpios |
| Regresión | `/`, `/habitaciones`, `/reservar`, `/reventa`, `/historico`, `/ayuda`, `/admin/dashboard` → **200**; `/api/auth/session` y `/api/housekeeping/shifts` → **401** |
| Pruebas | `@hotel/shared` **431** (nuevo guardián de forma SQL), `@hotel/web` **583**, `@hotel/worker` **132**; typecheck y build OK |

**Nota sobre el aviso.** No aparece porque `hiddenSoldCount` es **0**: desde `v14` el índice de
producción está sano y no hay noches vendidas ofreciéndose. El aviso es la red de seguridad para
cuando vuelva a desfasarse, no un estado permanente.

**Rollback.** La revisión anterior **sin el defecto** es `v14`:
`gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00014-sn9=100`.
(`00017-hoh`/`v15` es funcional pero con el SQL roto cayendo al respaldo RPC: no usarla como destino
de rollback.) Las etiquetas `v15` y `v16` se conservan como URLs de canario.

---

## 27. Release `v17` — mismo código, procedencia cerrada (2026-10-01)

**Por qué esta release si `v16` ya traía la corrección.** `v15` y `v16` se construyeron de un árbol de
trabajo **aún sin pushear** (se desplegó antes de commitear el arreglo SQL). `web:v17` se construye ya
desde el commit **`0829481`**, que está en los tres remotos de `anlucorporations`, así que la imagen en
producción y el código versionado **coinciden**. Es una release de trazabilidad, **no de comportamiento**:
queda dicho expresamente para que nadie busque un cambio funcional que no existe.

**Push previo:** `a8db3a5..0829481` en `origin` (gitlab.com), `github` y `codecrypto`; verificado tras
`fetch` — los tres remotos y `HEAD` en `0829481`.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v17` (3m37s, build `fe869060-1fc5-45e3-879e-2d58ec4701fa`), mismos `NEXT_PUBLIC_*` (contrato `0xc66A…7b6F`, bloque 314) |
| Procedimiento | El de §26: `--no-traffic --tag=v17` → **canario verificado** → `update-traffic --to-revisions=…=100` |
| Revisión | `hotel-mcp-web-00021-tid` al **100 %** (rollback: `00019-jef`, misma código; anterior a F9: `00014-sn9`) |
| Configuración | **18 variables y 9 secretos** conservados |
| Sin cambios | `worker:v14`, `mcp:v14`, `monitor:v14`; contrato, base de datos y siembra intactos |

### Verificación (producción)

| Comprobación | Resultado |
|---|---|
| Canario **antes** de mover tráfico | `/health/ready` **200 READY**; `/catalogo` **200**; `/` y `/admin/dashboard` **200**; **logs sin el error `DISTINCT` ni respaldo RPC** |
| `/health/ready` | **READY** (postgres, redis y `polygonRPC` **UP**) |
| `/catalogo` | **200 · 154.716 B — idéntico byte a byte a la baseline de `v16`**, lo que confirma empíricamente que no hay delta funcional; aviso renderizado **0** (sin fantasmas) |
| Regresión | **18 rutas públicas** → **200**; las cuatro suites sin sesión sirven el gate con **cero** marcadores de panel |
| APIs protegidas | `/api/housekeeping/shifts`, `/api/mantenimiento/board`, `/api/admin/actividades/activities`, `/api/auth/session` → **401** |
| Imagen social | **200 `image/png`**, PNG válido **1200×630** (105.863 B) |
| Worker / MCP (v14) | `lag 0` y `aggregateLag 0` (bloque 479); mcp `ok`. El `emailDegraded: true` sigue siendo el SMTP de relleno (§19–§26) |
| Logs de la revisión servida | Ninguna consulta del catálogo falló |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00019-jef=100`
(`v16`, mismo código) o `hotel-mcp-web-00014-sn9=100` (previo a F9). Las etiquetas `v15`, `v16` y `v17`
permanecen como URLs de canario.

---

## 28. Release `v18` — identidad visual «Brisa Marina» en producción (2026-10-02)

**Qué se desplegó.** El rediseño visual completo (`b761a3e`, *feat(identidad): rediseño visual «Brisa
Marina» v2.0.0 en toda la web*): sistema de color nuevo, tipografías `Playfair Display` + `Manrope`
con cirílico nativo, 142 ficheros migrados y el arreglo de las claves i18n de `/contacto`. **Solo la
web**: `worker`, `mcp` y `monitor` no tienen delta (la identidad vive en `apps/web`, en el preset
compartido y en las piezas de marca).

**Push previo:** `0829481..b761a3e` en **`github`** (rama `Hotel-DSH-GCP`). **`codecrypto` (GitLab)
rechaza la autenticación** —no hay credenciales válidas en el entorno; es el bloqueante **B-0**, que
sigue pendiente de que el responsable regenere el token. La release queda por tanto versionada en
GitHub y **no** en GitLab.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `web:v18` (**3m03s**, build `b3ed7710-b192-4984-a1ec-69dadb6c11f2`), mismos `NEXT_PUBLIC_*` (chainId 31337, contrato `0xc66a…7b6f`, bloque 314, faucet `0xdFdE…f75b`, `NEXT_PUBLIC_SITE_URL` = la URL de `run.app`, **igual que en `v17`**, verificado en los metadatos servidos para no regresar el `og:image`) |
| Procedimiento | El de §26: `--no-traffic --tag=v18` → **canario verificado** → `update-traffic --to-revisions=…=100` |
| Revisión | `hotel-mcp-web-00023-rep` al **100 %** |
| Configuración | **18 variables y 9 secretos conservados, cero cambiadas** (comparado servicio a servicio antes/después), misma cuenta de servicio `hotel-mcp-run@` y misma VPC `hotel-mcp-vpc`/`hotel-mcp-euw1` |
| Sin cambios | `worker:v14`, `mcp:v14`, `monitor:v14`; contrato, base de datos y siembra intactos |
| Fuera de la release | El arreglo **D-84** (redondeo al céntimo) quedó **excluido a propósito**: su suite está **roja** (`exchange-service.test.ts`: «una tarifa que ni llega a un céntimo … es null» → `expected 1 to be null`). La imagen se construyó con ese trabajo apartado, no desde el árbol sucio |

### Verificación (canario y producción)

| Comprobación | Resultado |
|---|---|
| Canario **antes** de mover tráfico | `/health/ready` **200 READY** (postgres, redis, `polygonRPC` **UP**); **8 rutas** → **200**; **logs sin `severity>=ERROR`** y **sin `MISSING_MESSAGE`** |
| Paleta servida (CSS real) | `--mist #f4f9fc`, `--azure #0f6c9c`, `--navy #0e2a3f`, `--coral-text #a34222` presentes; **cero** restos de `--sand`/`--sea`; `.bg-mist` generado |
| `axe` sobre el canario (navegador real) | `/`, `/catalogo`, `/contacto`, `/admin/dashboard` → **0 violaciones `critical`/`serious`**; consola **sin** errores ni avisos i18n |
| Defecto i18n corregido | `/contacto` renderiza **«Cómo llegar»** y **«Registro de viajeros»**; **0** claves crudas (`home.howToArrive.*`/`home.travelers.*`) |
| Producción tras el cambio de tráfico | `/health/ready` **200**; `/`, `/catalogo`, `/contacto`, `/reservar`, `/reventa`, `/historico`, `/ayuda`, `/habitaciones`, `/admin/dashboard` → **200**; el CSS servido es el de la paleta nueva |
| Etiquetas de canario | `v15`, `v16`, `v17` y `v18` conviven como URLs propias |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --project hotel-mcp --region europe-west1 --to-revisions=hotel-mcp-web-00021-tid=100` (vuelve a `v17`, el estado inmediatamente anterior).

**Nota de método.** El build sube el **árbol de trabajo**, no el commit: por eso, antes de construir, el
trabajo en curso ajeno a la release se apartó en un `stash` (y se restauró al terminar). Sin ese paso, la
imagen habría llevado lógica a medio terminar que **no está en ningún commit**.

---

## 40. Release `v19` — gestión de habitaciones y navegación del panel (2026-10-03)

**Qué se desplegó.** El ciclo del 2026-10-02/03 (`20aae23`, *feat(admin): acceso sin recargar,
Sistemas al primer nivel y gestión completa de habitaciones*): el arreglo del acceso (el formulario
ya no exige recargar), la sección **Sistemas** al primer nivel del sidebar, y la **ficha ampliada de
habitación** (columnas y tablas nuevas, API, formulario flotante con fotos, tabla resumen, ficha
reutilizable por perfil y calendario de publicaciones/ocupación).

**Por qué esta release necesita DOS imágenes.** Las migraciones de esquema las aplica el **worker** al
arrancar (`apps/worker/src/main.ts` → `runMigrations`). La web nueva consulta columnas y tablas que no
existían en `v18` (`rooms.view_kind`, `decor_*`, `room_space_types`, `room_spaces`), así que desplegar
solo la web habría dejado la API de habitaciones en error. Se construyó y desplegó **worker:v19**
primero (aplica el DDL, idempotente) y después **web:v19**.

**Push previo:** `7080df2..20aae23` en **`github`** y en **`codecrypto` (GitLab)**. GitLab, que había
rechazado la autenticación en las releases anteriores (B-0), **aceptó el push en esta ocasión**: ambos
remotos quedan al día.

| Paso | Detalle |
|---|---|
| Imágenes | Cloud Build `worker:v19` (**2m09s**, build `91b024f2-e58e-4df0-a681-0a9d2abc1788`) y `web:v19` (**2m47s**, build `802fa87b-c336-4277-a3c9-c3245767dce9`), desde el commit `20aae23` |
| Procedimiento | El de §26: `--no-traffic --tag=v19` → canario verificado → `update-traffic --to-revisions=…=100` |
| Revisiones | **`hotel-mcp-worker-00010-jut`** y **`hotel-mcp-web-00025-tec`** al **100 %** |
| Configuración | Web: **18 variables y 9 secretos conservados, cero cambiadas** (comparación antes/después), misma cuenta de servicio y VPC |
| Fuera de la release | El arreglo **D-84** (redondeo al céntimo) se apartó en un `stash` durante los builds por seguir con su test rojo, y se restauró al terminar |

### Verificación

| Comprobación | Resultado |
|---|---|
| Worker canario | `/health`: `lag 0`, `aggregateLag 0`, head 479, **sin errores** en logs y **sin** aviso de esquema no disponible; el `503` de la respuesta es el estado conocido del SMTP de relleno (`emailDegraded`, §19–§27) |
| Web canario (antes de mover tráfico) | **8 rutas** → **200** (`/`, `/catalogo`, `/habitaciones`, `/reservar`, `/contacto`, `/ayuda`, `/admin/dashboard`, `/health/ready`); CSS con la paleta «Brisa Marina» (`--mist`, `--azure`) y **sin** restos de la anterior |
| `axe` sobre el canario | `/`, `/catalogo`, `/contacto`, `/admin/dashboard` → **0 violaciones `critical`/`serious`**; consola sin errores ni `MISSING_MESSAGE` |
| Producción tras el cambio de tráfico | `/`, `/health/ready`, `/catalogo`, `/contacto`, `/habitaciones`, `/admin/dashboard` → **200**; logs de la revisión servida **sin errores** |
| Etiquetas de canario | `v15`…`v19` conviven como URLs propias |

**Límite declarado de esta verificación.** Las pantallas **nuevas del panel** (formulario flotante,
tabla resumen, ficha y calendario) **no se pudieron ejercitar en producción**: `/admin/**` exige sesión
de owner (contraseña + TOTP) y no se dispone de credenciales. Se verificaron en navegador real antes de
desplegar (axe 0, matriz de perfiles y 35 días de calendario; evidencias en `RepoTecnico/evidencias`)
y se validaron contra PostgreSQL real (migración idempotente y `base_datos.sql` en transacción con
`ROLLBACK`). La comprobación que queda para el responsable es **abrir `/admin/habitacion` con su
sesión** y recorrer alta → ficha → calendario.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --project hotel-mcp --region europe-west1 --to-revisions=hotel-mcp-web-00023-rep=100` (vuelve a `v18`) y, para el worker, `--to-revisions=hotel-mcp-worker-00008-fnt=100`. Las columnas nuevas **no** se revierten (son aditivas y la versión anterior las ignora).

---

## 41. Release `v20` — precios en euros correctos (D-84) y su efecto medido (2026-10-04)

**Qué se desplegó.** El arreglo **D-84** (`b63a8bd`): `weiToEurCents` redondea al céntimo en lugar de
truncar y `null` queda para lo no convertible; se retira la tasa de emergencia `1,7` (la de POL) y se
corrigen las fuentes para pedir el **nativo de la cadena** (`ids=ethereum` / `ETH+EUR`), que era la
causa raíz. Con ello, la ruta pública de reservas deja de responder 409 «no hay tarifa publicada»
cuando la habitación sí la tiene. Se incluye también la utilidad de inyección de datos y su
documentación (`9714ec1`, solo scripts y docs: **no entra en las imágenes**).

**Push previo:** `75cde47..9714ec1` en **`github`** y **`codecrypto` (GitLab)**.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build **`web:v20`** (3m12s, build `5b8021ba-a1db-4c8f-93c9-9474f12e4852`) desde `9714ec1`; el worker no cambia |
| Revisión | **`hotel-mcp-web-00027-dil`** al **100 %** (canario `v20` verificado antes de mover tráfico) |
| Configuración | 18 variables y 9 secretos conservados; misma SA y VPC |
| Rollback | `gcloud run services update-traffic hotel-mcp-web --project hotel-mcp --region europe-west1 --to-revisions=hotel-mcp-web-00025-tec=100` |

### El defecto, medido en producción (A/B antes/después)

La única habitación publicada (nº 101, `baseRateWei = 0,05 nativo`) permitió ver el defecto y su
corrección con la misma petición:

| Versión servida | `perNightCents` | Lectura |
|---|---|---|
| `v19` (antes) | **0** | El precio se truncaba a 0 → la reserva se bloqueaba con 409 | 
| `v20` canario, con la caché aún envenenada | **1** | Ya no es 0, pero la tasa era la de POL (~0,11 €) |
| `v20` en producción, caché renovada | **11 948** (119,48 €) | Tasa ETH real (2 389,6 €) |

### Hallazgo operativo: la caché compartida acopla la revisión vieja con la nueva

La clave de caché de la tasa es **`hotel:rates:pol_eur`**, un nombre heredado de la época en que se
cobraba en POL y **agnóstico del activo**. Durante el canario, la revisión antigua (`v19`) seguía
sirviendo el 100 % del tráfico y **reescribía esa misma clave con la tasa de POL cada 5 minutos**, así
que la revisión nueva leía la tasa equivocada: el precio pasó de 0 a 1 céntimo, no a 119,48 €. Al
mover el tráfico, la revisión antigua dejó de escribir y, al expirar el TTL (300 s), la nueva refrescó
la tasa correcta (verificado midiendo cada 55 s hasta la convergencia).

**Recomendación (no incluida en esta release).** Renombrar la clave a algo dependiente del activo
(p. ej. `hotel:rates:eur_per_native`) o incluir el activo en la clave, para que un cambio de divisa no
pueda reutilizar un valor viejo. Es un cambio de dos líneas con prueba, pero exige otra release; se
deja propuesto y documentado en lugar de colarlo en esta.

### Verificación

| Comprobación | Resultado |
|---|---|
| Canario (antes de mover tráfico) | `/health/ready` **200**; `/`, `/catalogo`, `/reservar`, `/contacto`, `/admin/dashboard` → **200** |
| Precio tras la convergencia de la caché | **119,48 €/noche** para la habitación 101 (antes 0) |
| Producción | `/`, `/health/ready`, `/catalogo`, `/reservar`, `/contacto`, `/mis-noches`, `/habitaciones`, `/admin/dashboard` → **200**; logs de la revisión servida **sin errores** |
| Pruebas | `@hotel/shared` **444** (46 ficheros), incluidas las 12 de tasas con la frontera del redondeo fijada |

---

## 42. Release `v21`→`v22` — tablero de habitaciones: iconos, acciones rápidas y masivas (2026-10-04)

**Qué se despliega.** El tablero de Habitaciones del back-office (§40 de `estado_proyecto.md`): iconos
por estado (publicación y operativo) con distintivo «Reservada», columna de **acciones rápidas**
(Publicar / Reservar / Activar-Desactivar) en lugar del botón «Ver ficha», y **acciones masivas** desde
la cabecera (Publicar / Liberar / Activar-Desactivar) con casillas solo para las habitaciones elegibles.
Toca `packages/shared` (dos métodos de lectura nuevos) y `apps/web`; **no** hay migración de esquema.

**Solo se despliega `web`.** Verificado por búsqueda: `countReservedNightsByRooms` y
`listReleaseableReservationIds` solo los consume la API de la web. `worker`, `mcp` y `monitor` siguen en
sus revisiones (mismo criterio que la release F9, §26).

| Paso | Detalle |
|---|---|
| Imagen `v21` | Cloud Build `96d6…`/`eebac739` · `web:v21` · 2m58s · **SUCCESS** |
| Revisión `v21` | `hotel-mcp-web-00029-fey`, al **0 %** de tráfico con etiqueta `v21` (canario) |
| **Defecto detectado en el canario** | `GET /api/admin/rooms` devolvía `reservedNights` como **cadena** (`"1"`) |
| Imagen `v22` | Cloud Build `96d6aece-44b6-4843-a1bc-91d508e21052` · `web:v22` · 2m48s · **SUCCESS** |
| Revisión `v22` | `hotel-mcp-web-00030-xaf` → **100 %** del tráfico; etiqueta `v22` |
| Limpieza | Etiqueta `v21` retirada y revisión `00029-fey` **eliminada** (no quedan canarios rotos) |

### El defecto que destapó la verificación en producción (y por qué no lo vio el test)

`COUNT()` en PostgreSQL es `bigint` y **node-postgres lo entrega como cadena**. El repositorio lo
mapeaba con `as number` (un cast de TypeScript, que no convierte nada en tiempo de ejecución), así que
la API publicaba `"1"`. Con ese valor, las reglas del tablero comparaban `reservedNights === 0` (estricto)
y **PUBLICAR y ACTIVAR/DESACTIVAR quedaban deshabilitadas para todas las habitaciones** — un fallo
silencioso que la interfaz no habría delatado como error, solo como acciones siempre en gris.

Los tests unitarios no lo vieron porque el mock del repositorio devolvía un **número**
(`{ nights: 3 }`), no la cadena que produce el driver. La corrección va en tres capas:

1. **Repositorio**: `Number(row.nights)` al construir el mapa (arregla el origen).
2. **Regla pura**: `reservedNightsOf()` normaliza en `room-bulk.ts` (defensa en profundidad).
3. **Carga del listado**: la web normaliza `reservedNights` al recibir la respuesta.

Y el test del repositorio pasa a devolver **cadenas** (`{ nights: "3" }`), que es lo que el driver
entrega de verdad, más 4 pruebas nuevas en `room-bulk.test.ts` para el caso cadena.

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| Canario `v22` · `/health/ready` | **200** · `READY` (postgres, redis y RPC `UP`) |
| Canario `v22` · `/`, `/admin/habitacion` | **200** / **200** (pantalla de acceso: el gate protege el contenido) |
| Código nuevo en el chunk servido | `rooms-bulk-toggle`, `room-quick-publish`, `room-reserved`, `room-select`, `bulk/publish|release|toggle` **presentes** |
| Endpoints nuevos sin sesión | `POST /api/admin/rooms/bulk/{publish,release,toggle}` → **401** (existen y protegen) |
| Login E2E con la cuenta owner sembrada (TOTP) | MFA **200** · sesión válida |
| **`GET /api/admin/rooms` (owner)** | **200** · **50** habitaciones · `reservedNights` **en todas** y **numérico** (`1`, no `"1"`) |
| `reservedWindow` | `2026-10-04 → 2027-03-03` (hoy → +150 días, lo diseñado) |
| Habitaciones con noches reservadas | **6** (coincide con las noches vendidas sembradas) |
| `bulk/publish` sin TOTP (con sesión) | **403** `MFA_REQUIRED` — valida antes de tocar nada |
| `bulk/release` y `bulk/toggle` con lote vacío | **400** `INVALID_BODY` |
| URL pública tras mover tráfico | Mismas comprobaciones **200** y `reservedNights` **numérico** |

> Las acciones masivas **no** se ejecutaron contra producción: publicar, liberar o conmutar estado
> mutan datos reales y eso requiere orden explícita del responsable. Lo verificado es que las rutas
> existen, validan y calculan el lote (`reservedNights` numérico y ventana correcta).

**Lección para el próximo ciclo.** Un `as number` sobre una columna de agregado **no** convierte: el
mock debe devolver el tipo que devuelve el driver (cadena para `bigint`/`numeric`), o el defecto viaja
hasta producción. Esta es la misma familia de fallo que §37 («una lección sobre los mocks»).

---

## 43. Release `v23` — subsección «Publicar»: CalendarioHabitaciones y gestión del día (2026-10-05)

**Qué se despliega.** La subsección «Publicar» (§41 de `estado_proyecto.md`): tablero de disponibilidad
por día/semana/mes/trimestre con icono y total por estado, panel del día (publicar, reservar, liberar,
acuñar la noche y servicios) y el cambio de etiquetas de estado a MANTENIMIENTO / SERVICIO. Sustituye a
«Publicar noche» (`/admin/mint`), cuyo minteo on-chain pasa al panel del día.

**Solo se despliega `web`.** Los dos métodos nuevos del repositorio son de solo lectura y **solo** los
consume la API de la web (verificado por búsqueda); `worker`, `mcp` y `monitor` no cambian. Sin
migración de esquema.

| Paso | Detalle |
|---|---|
| `push` | `a8e79ac` a los tres remotos de `anlucorporations` (`origin`, `github`, `codecrypto`), rama `Hotel-DSH-GCP` |
| Imagen | Cloud Build `0d649e89-8185-418e-8e2c-395fd64e8f21` · `web:v23` · 3m10s · **SUCCESS** |
| Canario | `hotel-mcp-web-00033-men` al **0 %**, etiqueta `v23`, verificado antes de mover tráfico |
| Producción | `00033-men` al **100 %**; `v22` queda como etiqueta para volver atrás |
| Limpieza | No hubo defecto: no se retiró ninguna revisión |

### Verificación (despliegue real)

| Comprobación | Resultado |
|---|---|
| Canario y URL pública · `/health/ready` | **200** · `READY` (postgres, redis y RPC `UP`) |
| Rutas | `/` **200** · `/admin/habitacion` **200** · `/admin/habitacion/publicar` **200** · `/admin/mint` **404** (retirada) |
| Endpoints nuevos sin sesión | `GET /api/admin/rooms/calendar` (con `?from&to` y con `?date`) → **401** |
| Login E2E con la cuenta owner sembrada (TOTP) | MFA **200** · sesión válida |
| Totales (semana 05–11 oct) | **200** · **7** días · `range` correcto · `maintenanceRooms` 0 |
| Detalle del día (15 oct) | **200** · **50** habitaciones · resumen `{published:1, reserved:0, occupied:0, maintenance:0}` · todas con las cuatro banderas |
| Rango amplio (05 oct → 31 dic) | **200** · **88** días · publicadas **88**, ocupadas **6**, reservadas **0** |
| ¿`reserved = 0` es un fallo del SQL? | **No**: `GET /api/reception/reservations` devuelve **0** reservas vivas. El ramal de ocupadas (tokens) sí enciende; el de reservas queda cubierto por pruebas |
| Etiquetas servidas | `MANTENIMIENTO` y `SERVICIO` presentes; **`Fuera de servicio` ausente** en el HTML público |
| Imagen del servicio | `…/web:v23` |

---

## 44. Inicialización de la plataforma desde cero — reset off-chain (2026-10-05)

**Petición del responsable:** dejar la plataforma limpia para arrancar el recorrido de casos de uso,
**eliminando todos los datos de la base off-chain** y **sin reiniciar** los servicios globales
(Foundry/Anvil y PostgreSQL/Cloud SQL).

### Respaldo previo (obligatorio para el paso destructivo R-2)

| Respaldo | Identificador |
|---|---|
| Backup nativo de Cloud SQL | `1791211892354` · `SUCCESSFUL` · «pre-reset plataforma limpia 2026-10-05T14:51:31Z» |
| Export `.sql` a GCS | `gs://hotel-mcp-backups/pre-reset-20261005_145308.sql` (214 KiB) |

El bucket `hotel-mcp-backups` **no existía** (el runbook lo daba por hecho): se creó en
`europe-west1` y se concedió `roles/storage.objectAdmin` a la cuenta de servicio de Cloud SQL
(`p475955050238-6e4cqe@gcp-sa-cloud-sql.iam.gserviceaccount.com`), sin la cual el export devuelve
`HTTP 412`.

### Hallazgo 1 · El job documentado **no puede** alcanzar la base

`hotel-mcp-inject-data` (el vehículo del runbook F8 para reset y siembra) **no tiene red configurada**
(`vpcAccess`/`networkInterfaces` vacíos), y Cloud SQL es **solo IP privada** (`10.104.0.3`,
`ipv4Enabled: false`, red `hotel-mcp-vpc`). Con esa configuración el job no llega a la base: el
`DATABASE_URL` del secreto apunta justo a esa IP privada. Se creó un job dedicado
**`hotel-mcp-reset-all`** con el mismo entorno y SA pero **con la red que faltaba**
(`--network=hotel-mcp-vpc --subnet=hotel-mcp-euw1 --vpc-egress=private-ranges-only`).

También se descubrió que la imagen **no resuelve `tsx` desde la raíz**: hay que invocarlo con
`pnpm --filter @hotel/shared exec tsx …` (el binario vive en `packages/shared/node_modules/.bin`, no en
la raíz del monorepo).

### Hallazgo 2 · `TRUNCATE … CASCADE` habría borrado un catálogo

`preventive_plans.room_id → rooms(id) ON DELETE SET NULL`. Con `TRUNCATE rooms CASCADE`, PostgreSQL
arrastra **todas** las tablas que referencian a `rooms` sin mirar la acción, así que se habrían perdido
los **planes preventivos** (catálogo que debía conservarse). Por eso el reset usa **`DELETE` ordenado**
—hijos antes que padres—, que respeta `SET NULL`: los planes sobreviven con `room_id = NULL`.

El orden no se improvisa: vive en `packages/shared/src/db/reset-plan.ts` y
`reset-plan.test.ts` lo **valida contra `base_datos.sql`** (cobertura de las 46 tablas y orden
topológico). Si alguien añade una tabla o una FK, la prueba se pone roja antes de ejecutar nada.

### Qué se borró y qué se conservó

| | Tablas |
|---|---|
| **Borradas (36)** | habitaciones y toda su ficha (imágenes, servicios, espacios, publicaciones, historial), reservas (noches, contactos, historial), folios, cargos y checkouts, reseñas, actividades y agendas, housekeeping (turnos, asignaciones, registros), movimientos de lencería, incidencias y tareas de mantenimiento, contenido de la web, contingencia de check-in, índice de cadena (`nfts`, `listings`, `sale_events`, histórico y logs del worker), avisos de correo y push, y sesiones |
| **Conservadas (8)** | `admin_users`, `mfa_recovery_codes` (operadores, para poder entrar), y los catálogos/semillas `room_types`, `room_amenities`, `room_space_types`, `supply_items`, `preventive_plans`, `platform_settings` |

### El detalle que evita que la base se repueble sola

La cadena **no se toca**, así que sigue con sus habitaciones registradas y sus noches. Si se vaciara la
base dejando los checkpoints a cero, el worker **reindexaría** el pasado y las noches viejas volverían a
aparecer. El reset fija **antes** de borrar (y en este orden):

1. `worker_checkpoints.last_block` = cabeza de la cadena (**479** en esta ejecución);
2. `worker_aggregate_counters.last_block` = 479 (misma cabeza, para el procesador de agregados).

Y solo después borra. Si lo hiciera al revés, el worker podría escribir datos viejos en el hueco entre
el borrado y el ajuste del checkpoint.

### Verificación (producción real)

| Comprobación | Resultado |
|---|---|
| Conteos antes → después | `rooms 50→0` · `nfts 95→0` · `sale_events 91→0` · `admin_users 2→2` |
| Worker tras 90 s (¿repuebla?) | `nfts`, `sale_events` y `rooms` siguen a **0** |
| Checkpoints del worker (`/health`) | `lastBlock 479` · `headBlock 479` · **`lag 0`** · `aggregateLastBlock 479` · `aggregateLag 0` |
| Operadores (API) | **2** · login E2E con TOTP **200** |
| Catálogos (API) | tipos **3** · servicios **8** · espacios **6** · lencería **4** · **planes preventivos 1** |
| Resto (API) | incidencias **0** · reservas **0** |

> **Observación previa, no causada por el reset.** El worker se declara `down` por `emailDegraded: true`
> y `/api/admin/system/operations` devuelve **503**. La causa es `SMTP_HOST=smtp.invalid` (placeholder
> del script `70-deploy-apps.sh`), y la revisión del worker es del **2026-10-03**, dos días anterior a
> este reset: la degradación ya existía. Los indicadores que sí dependen del reset (lag de cadena y de
> agregados) están a **0**.

---

## 45. Release `v25` — las fotos entran en la imagen (2026-10-05)

**Para qué.** La inyección `@planta` dejó 40 habitaciones con su foto registrada en `room_images`, pero
al desplegar una instancia **nueva** (canario `v24`) **todas** las fotos devolvían **404**, incluidas las
semilla (`101-Simple-2026-09-28-1.jpg`), que hasta entonces solo funcionaban en la instancia que había
recibido la subida.

### Defecto de fondo (previo, no causado por la inyección)

`.dockerignore` y `.gcloudignore` **excluían `docs`**, y las fotos de habitación y de contenido viven en
`docs/imagenes` (D-5): la web las lee del sistema de ficheros en cada petición
(`roomImagesDir()` → `<cwd>/../../docs/imagenes`). Con `docs` fuera del contexto de build, la carpeta
**nunca** existió dentro del contenedor.

Consecuencia real: **ninguna foto se servía de forma duradera en producción**; solo respondía la
instancia que había recibido la subida en caliente (y se perdía al redesplegar o al caer en otra
instancia). Afectaba por igual a las fotos de habitación y a las de contenido.

**Por qué no bastaba con quitar una línea.** Docker **no permite volver a incluir** una subcarpeta
(`!docs/imagenes`) si su carpeta padre está excluida, así que la única corrección robusta es **no
excluir `docs`**. Se documentó en ambos ficheros, con el motivo, para que nadie lo vuelva a excluir
«para aligerar la imagen». Coste: ~18 MB en la imagen (13 MB son las fotos) y en la subida a Cloud Build.

### Pasos

| Paso | Detalle |
|---|---|
| Imagen `v24` | Build `c4802531` (3m29s) — **descartada**: el canario confirmó que las fotos seguían en 404 |
| Corrección | Se quita `docs` de `.dockerignore` y `.gcloudignore`, con comentario explicativo |
| Imagen `v25` | Build `5210c1ed` (3m20s) · `web:v25` · **SUCCESS** |
| Canario | `hotel-mcp-web-00036-zox` al 0 %, etiqueta `v25` |
| Producción | `00036-zox` al **100 %**; etiqueta `v24` retirada y revisión `00035-qop` **eliminada** |

### Verificación (producción real)

| Comprobación | Resultado |
|---|---|
| Canario · fotos **semilla** | `101-Simple`, `116-Doble`, `201-Suite` → **200** |
| Canario · fotos **nuevas** | **40/40** servidas desde la imagen (0 fallos) |
| URL pública · fotos semilla y nuevas | **200** con su tamaño real (444 012 / 105 410 / 150 081 B) |
| URL pública · las 40 de `@planta` | **40 servidas · 0 fallidas** |
| `/health/ready` · rutas | **READY** (postgres, redis, RPC `UP`) · `/` y `/admin/habitacion/publicar` **200** |
| Imagen del servicio | `…/web:v25` |

> **Nota para el futuro:** cualquier imagen que deba servirse por HTTP y viva en el repositorio tiene
> que estar **fuera** de `.dockerignore`/`.gcloudignore`; el límite de 2 MB por foto lo impone la API de
> subida, no el build.

---

## 46. Release `v26` — reconstrucción con procedencia limpia (2026-10-05)

**Por qué se reconstruye si la `v25` ya servía.** La `v25` se construyó desde el árbol de trabajo
cuando la corrección de `.dockerignore`/`.gcloudignore` **todavía no estaba commiteada**: su contenido
coincidía con el commit, pero la imagen no quedaba **anclada a un SHA**. Tras el `/push` (`0e3f931` en
los tres remotos) se reconstruye para que la release tenga procedencia exacta.

| Paso | Detalle |
|---|---|
| `push` | `0e3f931` a `origin`, `github` y `codecrypto` (rama `Hotel-DSH-GCP`): reset (`c5223f7`), `@planta` (`fb06ab5`) y release `v25` (`0e3f931`) |
| Imagen | Cloud Build `a7a15e3b` · `web:v26` · 3m29s · **SUCCESS** |
| Canario | `hotel-mcp-web-00039-wiz` al 0 %, etiqueta `v26`, verificado antes de mover tráfico |
| Producción | `00039-wiz` al **100 %**; `v25` se conserva como etiqueta de vuelta atrás |

### Verificación (producción real)

| Comprobación | Resultado |
|---|---|
| `/health/ready` | **READY** (postgres, redis y RPC `UP`) |
| Rutas | `/` **200** · `/admin/habitacion` **200** · `/admin/habitacion/publicar` **200** · `/admin/mint` **404** |
| Fotos (semilla y nuevas) | `101-Simple`, `116-Doble`, `201-Suite`, `410-Simple`, `305-Suite` → **200** con su tamaño |
| Las 40 fotos de `@planta` | **40 servidas · 0 fallidas** |
| Datos tras el despliegue | **40 habitaciones** (12 dobles · 8 suites · 20 simples), sin huecos |
| Imagen del servicio | `…/web:v26` |

> **Temporal ajeno**: `apps/web/shot.tmp.mjs` (script de captura de otra sesión, sin trackear) sigue en
> el árbol; viaja al contexto de build pero no afecta a la aplicación. No se toca porque no es de este
> ciclo.

---

## 47. Release `v27` — la tarjeta del catálogo muestra la foto de SU habitación (2026-10-05)

**Defecto corregido.** La tarjeta del catálogo pintaba siempre `/images/<tipo>.svg`, un **placeholder
genérico por tipo**: el catálogo nunca enseñaba la foto de la habitación en venta. El catálogo se lee
por RPC/base y solo conoce el **número** de habitación (no su UUID), así que la portada no estaba
resuelta en ninguna capa.

**Corrección (3 capas + guardianes):**

| Capa | Cambio |
|---|---|
| `RoomsRepository` | `listCoverImagesByRoomNumbers`: portada por **número**, en **una** consulta, priorizando `is_cover` y luego la posición, ignorando las archivadas |
| `lib/nights.ts` | `NightView.coverUrl` + `withCoverUrls` (puro y probado) + `attachRoomCovers`, que enriquece catálogo (BD y RPC) y reventa. **Falla en blando**: sin portada, la tarjeta cae a su imagen de tipo; nunca se enseña la foto de otra habitación |
| `NightImage` | Cadena de degradación **foto real → imagen de tipo → aviso accesible** |
| Guardianes | El test de nombres se pone al día con la **planta vigente** (`x01`–`x03` doble · `x04`–`x05` suite · `x06`–`x10` simple) conservando las 3 portadas históricas como origen de `@planta`; el índice `docs/imagenes/README.md` documenta las 40 fotos nuevas |

**Por qué salieron los guardianes.** Los dos fallos de la suite no eran del catálogo: el guardián de
nombres seguía fijando el **maestro antiguo** (101–115 simple, 116–130 doble, 201–220 suite), que la
redistribución de `@planta` invalida, y el índice de la carpeta exigía documentar los 40 ficheros
nuevos. Se corrigieron con la planta aprobada, no relajando la comprobación.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `6006cd82` · `web:v27` · 3m15s · **SUCCESS** |
| Canario | `hotel-mcp-web-00041-xok` al 0 %, etiqueta `v27` |
| Producción | `00041-xok` al **100 %**; `v26` se conserva como vuelta atrás |

### Verificación (producción real) — antes / después

| | Antes (`v26`) | Después (`v27`) |
|---|---|---|
| Tarjeta del catálogo (hab. 101) | `2 × images/simple.svg` (placeholder) | `api/rooms/images/101-Doble-2026-10-05-1.jpg` |
| Placeholders por tipo en el HTML | **2** | **0** |
| Foto servida | — | **200** · 105 410 B · `image/jpeg` |
| `/health/ready` | READY | **READY** |

> El catálogo ofrecía **una** noche (hab. 101, 27-dic-2026) leída de la cadena: es el único inventario
> vivo tras el reset, porque el índice off-chain arrancó vacío con el checkpoint en la cabeza (§44).

---

## 48. Release `v28` — la CSP deja hablar al frontend con el Anvil (2026-10-05)

**Objetivo del ciclo**: corregir el proceso de reserva, verificar el frontend y comprobar que el
backend trabaja sobre el Anvil desplegado en GCP.

**Cómo se encontró.** Las reservas funcionaban por API (retención pública y alta de recepción
devolvían **201**), así que el fallo tenía que estar en el navegador. Se verificó con **Chromium real
(Playwright)** contra producción y apareció el defecto, repetido en todas las páginas:

```
Connecting to 'https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app/' violates the following
Content Security Policy directive: "connect-src 'self' https://*.alchemy.com https://*.infura.io …"
Fetch API cannot load … Refused to connect because it violates the document's Content Security Policy.
```

**Causa.** El `connect-src` del middleware listaba Alchemy, Infura, WalletConnect y CoinGecko, pero el
RPC de **este** despliegue es un Anvil en Cloud Run: el navegador rechazaba la conexión, el frontend se
quedaba sin leer la cadena y todo lo que depende de la wallet (incluida la reserva) fallaba en
silencio. El backend sí hablaba con Anvil; era el **navegador** el que no podía.

**Corrección.** `rpcConnectOrigins()` deriva los orígenes permitidos de `NEXT_PUBLIC_RPC_URL` /
`NEXT_PUBLIC_WS_URL` (build) y `RPC_URL` (runtime), añadiendo el mismo host por `ws(s)`. No se cablea
ningún host; si la variable falta o no es una URL válida, la CSP no se rompe. Antes de tocar la
política se comprobó el **CORS** del RPC (`access-control-allow-origin: *`).

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `ae18add4` · `web:v28` · 3m9s · **SUCCESS** |
| Canario | `hotel-mcp-web-00043-ziw` al 0 % → CSP verificada en la cabecera antes de mover tráfico |
| Producción | `00043-ziw` al **100 %**; `v27` como vuelta atrás |

### Verificación del frontend (Chromium real, producción)

| Comprobación | Resultado |
|---|---|
| Errores de CSP | **0** (antes: en todas las páginas) |
| Páginas `/`, `/catalogo`, `/habitaciones`, `/reservar`, `/contacto`, `/empresa` | **200** |
| Foto del catálogo | `/api/rooms/images/101-Doble-2026-10-05-1.jpg` cargada (`naturalWidth > 0`) |
| Cartera contra el Anvil real | conecta (`wallet_requestPermissions`, `eth_requestAccounts`, `eth_chainId`) → cabecera `0x7099…79C8` |
| Flujo de reserva del huésped | `POST /api/public/reservations` → **201** y la UI muestra «Te hemos reservado la noche… Anticipo 72,45 € · Referencia MDS-BE6F025D» |
| Reserva desde el back-office (panel del día) | acceso con TOTP + acción «Reservar» → **«1 reservas creadas.»** (reserva `b461a36e`, hab. 101, 20-oct, PENDING) |
| Errores de consola (excluyendo el sondeo de sesión) | **0** |

Las cuatro reservas de prueba de este ciclo quedaron **CANCELLED** para no dejar datos sueltos.

> **Ruido conocido, no defecto**: en páginas públicas la consola registra `401 /api/auth/session` y
> `400 /api/auth/refresh` porque el cliente de sesión administrativa sondea sin cookie. Es el contrato
> actual de `refresh` (400 si falta el token, con test propio); se deja como está y se anota.

---

## 49. Release `v29` — traducción del menú «Publicar» y su guardián (2026-10-05)

**Segundo defecto del ciclo**, encontrado al recorrer el back-office con navegador real: al iniciar
sesión, la consola pintaba `MISSING_MESSAGE: admin.nav.publishBoard (es)`. El ítem de navegación que
añadió la v23 usa `labelKey: "publishBoard"` y `admin.nav` no tenía esa clave —existía
`admin.publishBoard` (título de la página) y nadie la enlazaba—, así que el menú quedaba sin traducir.

**Corrección.**
- `es`/`en`/`ru`: `admin.nav.publishBoard` = **Publicar** / **Publish** / **Публикация**.
- **Guardián nuevo** en `i18n-keys.test.ts`: las `labelKey` del menú se resuelven en runtime
  (`adminNav.ts`), así que el escaneo de llamadas `t("…")` no las veía. Ahora se comprueban aparte
  contra `admin.nav` en los tres idiomas; se verificó que **falla** al quitar la clave
  (`expected [ 'publishBoard' ] to deeply equal []`).
- De paso, el contador `inheritedNamespace` (se incrementaba y nunca se leía → error de lint previo)
  queda declarado como límite, igual que `dynamicKeys`.

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `2ff29a62` · `web:v29` · 3m14s · **SUCCESS** |
| Canario | `hotel-mcp-web-00045-cup` al 0 % → verificado antes de mover tráfico |
| Producción | `00045-cup` al **100 %**; `v28` como vuelta atrás |

### Verificación (Chromium real)

| Comprobación | Antes (`v28`) | Después (`v29`) |
|---|---|---|
| `MISSING_MESSAGE` en el back-office | 1 (`admin.nav.publishBoard`) | **0** |
| Menú lateral | ítem sin traducir | **«Publicar»** visible |
| Calendario de Publicar tras el acceso | — | **visible** (`calendario-habitaciones`) |
| Errores de CSP (URL pública) | 0 | **0** |
| Páginas `/`, `/catalogo`, `/habitaciones`, `/reservar`, `/contacto`, `/empresa` | 200 | **200** |
| Cartera contra el Anvil + flujo de reserva listo | — | **sí** (`Hab. 101`/`Hab. 102`, 241,51 €/noche) |

> El aviso «Tu sesión no tiene el rol necesario para esta sección» que aparece en el menú es un texto
> **`sr-only`** de accesibilidad (vive en un `<span class="sr-only">` del sidebar), no un error visible.

---

## 50. Release `v30` — despliegue anclado al commit empujado (2026-10-05)

**Contexto.** Las correcciones del ciclo (CSP del RPC y traducción del menú) ya estaban en producción
en `v28`/`v29`, pero se habían construido desde el árbol de trabajo. Tras el `/push` (`676539e` en los
tres remotos) se reconstruye para dejar la release **anclada a un SHA**, con el script de verificación
del backend incluido en el repositorio.

| Paso | Detalle |
|---|---|
| `push` | `676539e` a `origin`, `github` y `codecrypto`: catálogo (`c1d23f9`), release v27 (`bf0315a`), CSP (`b0a90d9`), traducción del menú (`83fa320`), registro v28/v29 (`607eb26`) y script de verificación (`676539e`) |
| Imagen | Cloud Build `6ada189a` · `web:v30` · 5m6s · **SUCCESS** |
| Canario | `hotel-mcp-web-00047-siw` al 0 %, etiqueta `v30`, verificado antes de mover tráfico |
| Producción | `00047-siw` al **100 %**; `v29`, `v28` y `v27` se conservan como vuelta atrás |

### Verificación (canario y URL pública)

| Comprobación | Resultado |
|---|---|
| `connect-src` incluye el Anvil del despliegue | **sí** (`https://…` y `wss://…`) |
| Páginas `/`, `/catalogo`, `/habitaciones`, `/reservar`, `/contacto`, `/empresa` | **200** |
| Foto del catálogo | cargada (`101-Doble-2026-10-05-1.jpg`, `naturalWidth > 0`) |
| Cartera contra el Anvil + flujo de reserva listo | **sí** (Hab. 101/102, 241,52 €/noche, botón «Retener la noche») |
| Errores de CSP / de consola | **0 / 0** |
| Menú del back-office | «Publicar» visible · **0 `MISSING_MESSAGE`** |
| `/health/ready` | **READY** (postgres, redis, RPC `UP`) |
| Worker sobre Anvil | `lastBlock 481` = `headBlock 481` · **lag 0** |
| Imagen del servicio | `…/web:v30` |

---

## 51. Releases `v31` y `v32` — «Mis noches» muestra la foto real de su habitación (2026-10-05)

**Petición**: que la sección **Mis noches** muestre la imagen real de cada habitación reservada.

**Por qué no la mostraba.** `useMyNights` descubre las noches **on-chain** (eventos `Sale` filtrados por
comprador + `ownerOf` para confirmar propiedad), y la cadena solo conoce el **número** de habitación:
la tarjeta caía al **placeholder por tipo** (`/images/<tipo>.svg`), el mismo defecto que tenía el
catálogo antes de la v27.

**Solución (v31).**

| Capa | Cambio |
|---|---|
| `GET /api/public/rooms/covers?numbers=101,305` | Resuelve **número → portada** contra el maestro off-chain (`listCoverImagesByRoomNumbers`) en **una** consulta; devuelve solo `{ covers: { "<nº>": { url, alt } } }`. Deduplica, acota a 60 números válidos, es cacheable y **falla en blando** (200 con `covers` vacío) |
| `useMyNights` | Enriquece cada `OwnedNight` con `coverUrl` (una llamada por conjunto de noches) |
| `MyNightCard` | Pasa `src` a `NightImage`, que ya degrada foto real → imagen de tipo → aviso |
| `lib/room-image-url.ts` | La regla de URL en un módulo sin dependencias: la usan el servidor (catálogo) y el cliente (Mis noches) sin arrastrar `fs`/Postgres al bundle |

**v32: defecto de maquetación que destapó la foto.** Al pasar del SVG a la imagen real, la captura
mostró que la foto **se escapaba de la tarjeta** y ocupaba casi toda la página: `NightImage` usa
`next/image` con `fill` (posicionamiento absoluto) y `MyNightCard` **no** le daba un padre `relative`
con tamaño, a diferencia de la tarjeta del catálogo. Se añadió el mismo contenedor
(`relative aspect-[4/3] overflow-hidden`).

| Paso | Detalle |
|---|---|
| Imagen v31 | Cloud Build `af17f203` · 4m8s · SUCCESS → revisión `00049-gax` (100 %) |
| Imagen v32 | Cloud Build `a658fdfc` · 3m10s · SUCCESS → revisión `00051-yap` al **100 %** (`v31`, `v30`… como vuelta atrás) |

### Verificación (Chromium real, con una cartera que **posee** noches)

Se usó `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`, que conserva **5 noches** compradas en el Anvil
desplegado (sondeo de solo lectura con `scripts/quien-tiene-noches.ts`):

| Noche | Habitación | Imagen servida | Resultado |
|---|---|---|---|
| `10120261027` | 101 | `/api/rooms/images/101-Doble-2026-10-05-1.jpg` | **foto real** ✓ |
| `10820261103` | 108 | `/api/rooms/images/108-Simple-2026-10-05-1.jpg` | **foto real** ✓ |
| `11820261110` | 118 | `/images/doble.svg` | imagen de tipo (la 118 **no existe** en la planta vigente) ✓ |
| `20220261124` | 202 | `/api/rooms/images/202-Doble-2026-10-05-1.jpg` | **foto real** ✓ |
| `10120261227` | 101 | `/api/rooms/images/101-Doble-2026-10-05-1.jpg` | **foto real** ✓ |

- Una sola llamada al endpoint con los números deduplicados (`numbers=101,108,118,202`) → **200**.
- **0 errores de consola** y las 5 imágenes cargadas (`naturalWidth > 0`).
- Regla intacta: una habitación sin foto **no** enseña la de otra; cae a su imagen de tipo.
- Evidencia: `RepoTecnico/mis-noches-v32.png`.

> **Nota de datos (no es un defecto de este cambio)**: la etiqueta de tipo de esas noches sale del
> `roomTypeOf` del **maestro antiguo** (101/108 como «Simple»), mientras que la foto sale del maestro
> vigente (101/108 son **dobles** en la planta nueva). Las noches se acuñaron antes de la
> redistribuciÃ³n, así que tipo y foto pueden discrepar; se resolverá cuando se acuñe inventario nuevo.

---

## 52. La quema programada de noches caducadas ya se ejecuta (2026-10-05)

**Revisión del proceso** (CU-13 / US-09 / D-03):

| Pieza | Qué hace |
|---|---|
| Contrato `HotelNights.burnExpired(uint256[])` | `onlyRole(BURNER_ROLE)`; exige `_isExpired` (fecha del token < hoy) y quema el inventario. `burnBatchMax()` = **50**; `mint` **rechaza** fechas pasadas (`PastDate`), así que no se puede fabricar una caducada |
| `BurnerService` (`packages/shared`) | Selecciona `nfts` con `status='AVAILABLE'` y `check_in_date < hoy`, comprueba saldo del operador, trocea por `burnBatchMax`, **simula** cada lote antes de enviar y contabiliza los omitidos |
| `burn-scheduler` (worker) | Una vez al día a las **12:00 Europe/Madrid** (hora de salida), con cerrojo diario en Redis (`hotel:burn:day:<día>`, 26 h) y reloj **de la cadena** (el `block.timestamp` es el que caduca en el contrato). Si el ciclo no se completa, libera el cerrojo para reintentar |
| Configuración | Requiere `BURNER_WALLET_PRIVATE_KEY`; sin ella el planificador **no arranca** (solo un aviso) |

**Defecto encontrado (el objetivo del ciclo).** El worker desplegado **no tenía ninguna variable de
quema**: el planificador nunca arrancaba. Además, el tráfico del servicio estaba **fijado por nombre de
revisión** (`-00010-jut`), así que toda revisión nueva quedaba sin tráfico y Cloud Run la **retiraba en
el mismo segundo** — un despliegue que *parecía* correcto mientras seguía sirviendo la revisión vieja.

**Qué se hizo:**

| Paso | Detalle |
|---|---|
| Rol | `BURNER_ROLE` concedido a la **hot-wallet documentada** (cuenta 2, `0x3C44…`): tx `0x10a4fcff…`, bloque **486**, `status: success`. Antes lo tenía el desplegador |
| Secreto | `hotel-burner-private-key` en Secret Manager + `secretAccessor` para `hotel-mcp-run@` y `ci-deployer@` (sin IAM la revisión se retiraba) |
| Worker | `--update-secrets=BURNER_WALLET_PRIVATE_KEY=…` y `--update-env-vars=BURN_HOUR_LOCAL=12,BURN_TIMEZONE=Europe/Madrid,BURNER_MIN_BALANCE_NATIVE=1` |
| Tráfico | `update-traffic --to-latest` para desbloquear el pin; el spec queda con `latestRevision: true` (los despliegues futuros enrutan solos) |
| Cadencia | Se verificó con `BURN_INTERVAL_MS=120000` (modo forzado de dev) y **se retiró**: queda en modo **diario** (`intervalMs: 300000`, hora 12, `Europe/Madrid`) |

### Verificación (producción real)

| Comprobación | Resultado |
|---|---|
| Planificador activo | `planificador de quema activo · {modo: "diario", hourLocal: 12, timeZone: "Europe/Madrid", dryRun: false, operator: "0x3C44…93BC"}` |
| **Ciclo ejecutado** | 19:42:44 · `planificador de quema: iniciando ciclo diario (dayKey 2026-10-05)` → `[Burner] No hay noches impagas caducadas pendientes de quema.` → `ciclo terminado {reason: "NO_TOKENS", burnedTokensCount: 0}` |
| Candidatas hoy | **0**: las 7 caducadas (2026-09-28 → 2026-10-04) **ya estaban quemadas** (`ownerOf` revierte) y la viva más antigua es del **2026-10-05** |
| Worker sobre la cadena | `lastBlock 486` = `headBlock 486` · **lag 0** · 0 fallos de RPC |
| Revisión sirviendo | `hotel-mcp-worker-00012-7wv` al **100 %** (tags `v19` conservados) |
| Pruebas | `packages/shared/src/burner` **13/13** · `burn-scheduler.test.ts` **8/8** |

> **Para ver una quema real** hace falta una noche **indexada** (`nfts`, `AVAILABLE`) cuya fecha pase:
> el contrato no admite acuñar fechas pasadas, así que la próxima quema ocurrirá con el inventario
> vivo (p. ej., la noche del 2026-10-05 en cuanto la cadena entre en el 2026-10-06) **siempre que esté
> en el índice off-chain**. Tras el reset el índice arrancó vacío (§44): lo que se acuñe por la app sí
> aparecerá; el inventario antiguo que solo existe on-chain no lo verá el quemador.

---

## 53. Release `v33` — despliegue anclado al commit empujado (2026-10-05)

**Contexto.** Los cambios de «Mis noches» (foto real + maquetación) ya estaban en producción en
`v31`/`v32`, construidos desde el árbol de trabajo. Tras el `/push` (`7c7b7ad` en los tres remotos) se
reconstruye para dejar la release **anclada a un SHA**. El worker **no** se reconstruye: su cambio de
este ciclo fue de **configuración** (secreto + variables + tráfico), no de código, y ya está vivo.

| Paso | Detalle |
|---|---|
| `push` | `7c7b7ad` a `origin`, `github` y `codecrypto`: foto real en Mis noches (`8b22133`), maquetación (`4c78772`), registro v31/v32 (`d41555f`) y quema programada (`7c7b7ad`) |
| Imagen | Cloud Build `6de16ec5` · `web:v33` · 3m29s · **SUCCESS** |
| Canario | `hotel-mcp-web-00053-cix` al 0 %, etiqueta `v33`, verificado antes de mover tráfico |
| Producción | `00053-cix` al **100 %**; `v32`, `v31`… como vuelta atrás |

### Verificación (canario y URL pública)

| Comprobación | Resultado |
|---|---|
| Páginas `/`, `/catalogo`, `/habitaciones`, `/mis-noches`, `/reservar`, `/contacto`, `/empresa` | **200** |
| Catálogo | **12 noches**, todas con la **foto real** de su habitación cargada (`naturalWidth > 0`) |
| «Mis noches» (cartera con 5 noches) | 4 con foto real (`101-Doble`, `108-Simple`, `202-Doble`) y la 118 con su imagen de tipo; **una sola** llamada a `/api/public/rooms/covers` (200) |
| Cartera contra el Anvil + flujo de reserva | **sí** (Hab. 101/102, botón «Retener la noche») |
| Errores de CSP / de consola | **0 / 0** |
| `/health/ready` | **READY** (postgres, redis, RPC `UP`) |
| Worker sobre Anvil | `lastBlock 486` = `headBlock 486` · **lag 0** · planificador de quema en modo **diario** |
| Imagen del servicio | `…/web:v33` |

---

## 54. Release `v34` — la quema deja de ofrecer noches ya quemadas (2026-10-05)

**Reporte del responsable**: «la quema de los nft es fallida con la billetera del owner».

**La billetera no era el problema.** La cuenta del owner (`0xf39F…`) **sí** tiene `BURNER_ROLE`
(verificado on-chain). El fallo estaba en **qué noches se ofrecían en el lote**.

**Causa raíz.** `_isExpired(tokenId)` en el contrato **solo mira la fecha** del token, no si el token
existe. Una noche ya quemada con fecha pasada sigue devolviendo `isExpired == true`. El escaneo del
panel (`useExpiredNights`) restaba las **vendidas** (eventos `Sale`) pero **no las quemadas**
(`Burn`), así que listaba las 7 noches de 2026-09-28 → 2026-10-04 (ya quemadas) y `burnExpired`
revertía con `ERC721NonexistentToken` (`0x7e273289`) al intentar quemarlas.

**Reproducción en producción (antes del arreglo, `v33`)**:

| Comprobación | Resultado |
|---|---|
| Panel `/admin/caducadas` (con la cartera del owner) | **«7 noches caducadas»** y botón *Quemar* **habilitado** |
| `isExpired(10120260928)` | `true` (¡aunque el token está quemado!) |
| `ownerOf(10120260928)` | revierte `0x7e273289` (`ERC721NonexistentToken`) |
| `simulateContract` de `burnExpired([esas 7])` con la cuenta del owner | **revierte `0x7e273289`** |

**Corrección (`v34`).**

| Capa | Cambio |
|---|---|
| `lib/burn-candidates.ts` (nuevo) | Pieza **pura** `selectBurnCandidates` = minteadas − vendidas − quemadas, para poder probarla sin navegador ni RPC |
| `useExpiredNights` | Consume también los eventos **`Burn(uint256 indexed tokenId)`** y los descuenta antes de confirmar la fecha con `isExpired` |
| Tests | 5 nuevos, incluido el caso exacto (una quemada con fecha pasada **no** es candidata) |

| Paso | Detalle |
|---|---|
| Imagen | Cloud Build `a0364d22` · `web:v34` · 3m18s · **SUCCESS** |
| Canario | `hotel-mcp-web-00055-reh` al 0 % → verificado antes de mover tráfico |
| Producción | `00055-reh` al **100 %**; `v33`… como vuelta atrás |
| Suite | web **697/697** · typecheck y eslint limpios |

### Verificación (Chromium real, cartera del owner)

| | Antes (`v33`) | Después (`v34`) |
|---|---|---|
| Recuento del panel de caducadas | **«7 noches caducadas»** | **«Sin noches caducadas.»** |
| Escaneo parcial | no | no |
| Errores de consola | 0 | **0** |

> **Cuándo se podrá ver una quema real**: la noche **`10120261005`** está viva, **no vendida** y sin
> quemar; deja de estar vigente cuando la cadena entre en **2026-10-06** (00:00 UTC ≈ 02:00 Madrid),
> y a partir de ahí el panel la ofrecerá como candidata legítima y la quema **sí** se firmará. Ojo: el
> ciclo **del worker** no la verá, porque selecciona desde el índice off-chain (`nfts`, vacío tras el
> reset §44); la quema de esa noche se hace desde el panel.

---

## 55. Relayer en servidor — fase 1: quema (2026-10-05)

**Motivo.** La quema la firmaba la **cartera conectada** en el navegador, así que el operador
necesitaba `BURNER_ROLE` en su cartera. Se monta un relayer con la **cuenta 4 de Anvil**
(`0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`), siguiendo el patrón que ya existía para el check-in de
recepción.

| Pieza | Detalle |
|---|---|
| Roles del relayer | `DEFAULT_ADMIN` + `MINTER` + `BURNER` (tx `0x6526ccf9…`/`0xe2f4c1fa…`/`0x62f3a545…`, bloques **492–494**) |
| Secreto | `hotel-relayer-private-key` (Secret Manager) con `secretAccessor` para `hotel-mcp-run@` y `ci-deployer@` |
| Web | `RELAYER_WALLET_PRIVATE_KEY` (secreto) + `RELAYER_MIN_BALANCE_NATIVE=1`; revisión `-00036-ddd` |
| Dominio | `BurnerService.burnTokens(...)`: quema **una lista dada** (no el inventario del índice) reutilizando troceo, simulación por lote y confirmación por recibo |
| Endpoint | `POST /api/admin/expired/burn` (sesión de administración; `tokenIds` validados, sin duplicados, ≤200) |
| UI | `useRelayerBurn` (mismo contrato que `useAdminWrite`) y `AdminExpired` migrado |
| Release | Cloud Build `b2b3f636` · `web:v35` · revisión `hotel-mcp-web-00059-cor` al **100 %** |

### Verificación

| Comprobación | Resultado |
|---|---|
| Endpoint **sin sesión** | **401** |
| Token **no caducado** (`10120261005`) | 200 · `reason: NO_TOKENS` · `skippedTokens: ["10120261005"]` (simula y omite, **no revierte**) |
| Token **ya quemado** (`10120260928`) | 200 · `NO_TOKENS` · omitido — el caso que antes revertía con la cartera del navegador |
| `/health/ready` | **READY** |

> **Pendiente de esta fase**: acuñación/registro (`useMintWindow`, `useMintNight`, `RoomsAdmin`) y los
> tests del endpoint nuevo. **La quema real** (una noche que caduque) se podrá verificar a partir de las
> **00:00 UTC** con la noche `10120261005`, ya sin roles en la cartera del operador.

---

## 57. El check-in no podía anclarse: faltaba la wallet de recepción en la web (2026-10-05)

**Reporte del responsable**: al hacer check-in aparecía *«La recepción no tiene configurada la wallet
on-chain: el check-in no puede anclarse y no se registra»*.

**Causa.** `POST /api/reception/checkin` ancla la noche on-chain con `markCheckedIn`, firmando con la
hot-wallet de recepción: si `RECEPTION_WALLET_PRIVATE_KEY` no está definida, el servicio se construye
**sin** `walletClient` y devuelve `ANCLAJE_NO_CONFIGURADO` (el check-in no se registra, por diseño: no
se marca lo que no se puede anclar). La **web no tenía esa variable** — solo el `.env` local.

Mismo patrón de fallo que la quema programada (§52): **configuración ausente en el servicio
desplegado**, no un fallo de lógica.

**Corrección.**

| Paso | Detalle |
|---|---|
| Secreto | `hotel-reception-private-key` (Secret Manager) con la clave de la **cuenta 3** (`0x90F7…93b906`, la hot-wallet de recepción documentada, que tiene `RECEPTION_ROLE` tras la alineación §«Estado verificado») |
| IAM | `secretAccessor` para `hotel-mcp-run@` y `ci-deployer@` |
| Web | `--update-secrets=RECEPTION_WALLET_PRIVATE_KEY=…` + `RECEPTION_MIN_BALANCE_NATIVE=5` (el umbral de aviso por saldo bajo) |
| Tráfico | `update-traffic --to-latest` para que la revisión nueva **no** se retire (el pin por revisión, §52) |

### Verificación

| Comprobación | Resultado |
|---|---|
| Revisión sirviendo | `hotel-mcp-web-00038-swx` al **100 %** |
| `RECEPTION_WALLET_PRIVATE_KEY` en el servicio | **sí** · `RECEPTION_MIN_BALANCE_NATIVE = 5` |
| Check-in con sesión de recepción y ticket de prueba | **400 `TICKET_INVALIDO`** («JWS Protected Header is invalid») → ya **pasa** la comprobación de wallet y valida el resguardo (antes se detenía en «wallet no configurada») |

> **Pendiente de verificar**: un check-in **real** (con un resguardo válido de una noche vendida) para
> confirmar el ancla on-chain extremo a extremo. El error reportado queda resuelto.
>
> **Recomendación**: hacer una revisión sistemática de las variables/secretos que cada servicio espera
> (`RECEPTION_*`, `RELAYER_*`, `BURNER_*`, `MINTER_*`…) contra las que tiene desplegadas; dos de los
> fallos de este ciclo han sido exactamente eso.

---

## 56. Release `v36` (canario, **NO promocionada**) — cualquier billetera: hallazgos (2026-10-06)

**Qué se entregó** (commit `637ee84`): descubrimiento **EIP-6963**, conector **Coinbase Wallet**,
**WalletConnect desactivado por defecto** (se activa con `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`),
ayudante `ensureWalletChain` (switch + alta de la red del Anvil) y optimización de MetaMask
(reutiliza el conector: un solo aviso; reconexión silenciosa; invalidación al cambiar cuenta/red).
Verificado en local: typecheck 0 · eslint 0 · **vitest 83 ficheros / 707 pruebas** · `next build` OK.

**Verificación con navegador real (canario `v36`, dos billeteras EIP-6963 simuladas)**:

| Comprobación | Resultado |
|---|---|
| Descubrimiento EIP-6963 | **funciona**: wagmi descubre el proveedor y llama `eth_accounts` + `eth_chainId` |
| Reconexión **silenciosa** | **sí**: solo `eth_accounts` (sin `eth_requestAccounts` ni popup) |
| Errores de CSP de WalletConnect/RPC | 0 |
| **Selector de billeteras** | ❌ **no lista opciones** (`[data-testid^="wallet-option-"]` = 0), ni con el menú abierto ni tras «Conectar wallet» |
| **CSP con Coinbase Wallet SDK** | ❌ **bloquea** `https://cca-lite.coinbase.com/amp` (el SDK llama a sus dominios y `connect-src` no los permite) |

**Decisión: no se promociona.** La producción sigue en **v35**. Los dos bloqueos son concretos:

1. **CSP**: añadir a `connect-src` (y `img-src` si el SDK carga iconos) los dominios del SDK de
   Coinbase (`https://*.coinbase.com`, `https://cca-lite.coinbase.com`, `https://*.walletlink.org`)
   y, si se activa WalletConnect, verificar el relay en el mismo punto. Se resuelve en
   `apps/web/src/middleware.ts` (la función `rpcConnectOrigins` ya marca el patrón a seguir).
2. **Selector**: hay que confirmar por qué el componente no renderiza los conectores descubiertos
   (¿filtro por `type`/`id`?, ¿el menú solo los pinta en un estado concreto?). Se reproduce con el
   script de dos billeteras EIP-6963 usado en esta verificación.

---

## 57. Check-in: «la recepción no tiene configurada la wallet on-chain» (2026-10-06)

**Síntoma** (reportado por el responsable): al hacer check-in, el sistema responde
*«La recepción no tiene configurada la wallet on-chain: el check-in no puede anclarse y no se
registra»*.

**Diagnóstico (por logs, no por suposición).** El mensaje sale del guardián
`ReceptionService.anchorCheckInOnChain` (`packages/shared/src/reception/service.ts:524`), que exige
`walletClient` + `publicClient` + `nftContractAddress`. La búsqueda en Cloud Logging lo sitúa en:

```
2026-10-05T23:28:52Z · hotel-mcp-web-00036-ddd · ANCLAJE_NO_CONFIGURADO
```

Y la revisión de ese momento **no** tenía el secreto de recepción:

| Revisión | `RECEPTION_WALLET_PRIVATE_KEY` | Estado |
|---|---|---|
| `hotel-mcp-web-00036-ddd` (23:20, la del error) | **NO** | retirada |
| `hotel-mcp-web-00038-swx` (**la que sirve al 100 %**) | **SÍ** (`hotel-reception-private-key:latest`) | activa |

**Causa de fondo**: el binding se añadió al *template* del servicio, pero por el **pin de tráfico por
revisión** (ver §56) la revisión que seguía sirviendo era una anterior **sin** la variable: la
actualización de configuración quedó en una revisión retirada y el hueco fue invisible hasta que
alguien usó el check-in. Es el mismo patrón que ya mordió en el worker y en el propio web.

**Estado actual (verificado)**:

| Comprobación | Resultado |
|---|---|
| Revisión que sirve | `hotel-mcp-web-00038-swx` al **100 %** (mismo digest que `web:v35`) |
| Secreto montado | `RECEPTION_WALLET_PRIVATE_KEY` ← `hotel-reception-private-key:latest` |
| Formato del valor | `0x` + 64 hex ✓ (no vacío, sin espacios) |
| Dirección derivada de la clave | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` (**cuenta 3**) |
| `RECEPTION_ROLE` de esa cuenta | **`true`** (concedido el 2026-10-05, tx `0xb2ee17ed67…`, bloque 489) |
| Gas | 10 000 ETH (umbral configurado: 5) |

**Acción**: reintentar el check-in; el anclaje ya tiene wallet, rol y saldo. Si volviera a aparecer el
mensaje, la comprobación a repetir es exactamente esta tabla (y comprobar que la revisión **que sirve**
—no el template— lleva el secreto).


---

## 58. Release v36 — suite de recepción: PENDING_CLEANING y ficha detalle (2026-10-06)

**Cambios funcionales**:
- Estado operativo `PENDING_CLEANING` tras check-out; solo recepción puede liberar la habitación.
- Ficha detalle de habitación con zonas Habitación y Huésped.
- Checklist de limpieza/preparación y contadores de ocupación en la reserva.
- Formulario de reserva actualizado con adultos, niños, bebés, mascotas y acceso PMR.
- Casos de uso CU-31/CU-34 actualizados; CU-38 y CU-39 nuevos.

**Builds (Cloud Build)**:

| Componente | Imagen | Estado |
|---|---|---|
| web | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:v36` | ✅ SUCCESS |
| worker | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/worker:v36` | ✅ SUCCESS |
| mcp | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/mcp:v36` | ✅ SUCCESS |

**Revisiones en Cloud Run**:

| Servicio | Revisión | Tráfico | URL |
|---|---|---|---|
| web | `hotel-mcp-web-00063-put` | 100 % | https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app |
| worker | `hotel-mcp-worker-00013-qvg` | 100 % | https://hotel-mcp-worker-d6jlzeq5yq-ew.a.run.app |
| mcp | `hotel-mcp-mcp-00005-tnl` | 100 % | https://hotel-mcp-mcp-d6jlzeq5yq-ew.a.run.app |

**Verificación post-deploy**:

| Endpoint | Resultado |
|---|---|
| `/health/ready` web | 200 READY (postgres, redis, polygonRPC UP) |
| Home `/` | 200 OK |
| `/recepcion` | 200 OK, HTML renderizado correcto (ver nota sobre el «404») |
| `/api/reception/overview` | 401 UNAUTHORIZED (protección correcta) |
| CSP | Incluye Anvil en `connect-src` ✅ |

**Nota — el «404 incrustado» es un falso positivo (verificado 2026-10-06).** Una primera verificación
reportó que `/recepcion` incrustaba `404 This page could not be found.` al final del HTML. Comprobado a
fondo, ese texto aparece **solo dentro de las etiquetas `<script>`** del *flight payload* RSC, donde
Next.js serializa la definición por defecto de la frontera `notFound` de cada segmento del router. No es
un 404 renderizado:

| Comprobación | Resultado |
|---|---|
| `/`, `/catalogo`, `/contacto` (públicas, sin gate) | también contienen el texto en su payload RSC |
| Ocurrencias en el marcado renderizado (sin `<script>`) | **0** |
| Estado HTTP | **200** |
| `<h1>` visible | «Puesto de recepción» / «Back-office…» según sesión |

Es decir: **no hay defecto que corregir**. Se descartó cualquier cambio en `app/recepcion/layout.tsx` u
otros ficheros para «arreglarlo»; el árbol quedó intacto.

---

## 59. Redespliegue de la release v36 y push de la documentación vNext (2026-10-06)

**Push**: commit `e247bf2` (documentación de la propuesta vNext: decisiones de auditoría resueltas e
`INFORME_AUDITORIA_VNEXT_V1.md`) publicado en `origin`, `github` y `codecrypto`.

**Redespliegue**: no hubo cambios de código respecto a `f6fbf3e`; se volvieron a desplegar las imágenes
`v36` ya construidas para dejar el conjunto coherente.

| Servicio | Revisión sirviendo | Tráfico | Nota |
|---|---|---|---|
| web | `hotel-mcp-web-00063-put` (tag `v36`) | 100 % | Cloud Run reutilizó la revisión: plantilla idéntica |
| worker | `hotel-mcp-worker-00014-lq2` | 100 % | Revisión nueva |
| mcp | `hotel-mcp-mcp-00005-tnl` | 100 % | Cloud Run reutilizó la revisión: plantilla idéntica |

**Verificación post-redespliegue**:

| Comprobación | Resultado |
|---|---|
| `/health/ready` web | 200 READY (postgres, redis, polygonRPC UP) |
| `/recepcion` | HTTP **200** |
| Tráfico web | `hotel-mcp-web-00063-put` al **100 %** (tag `v36`) |

**Nota**: Cloud Run solo crea revisión nueva cuando cambia la plantilla; al ser idéntica para web y mcp,
mantuvo las revisiones existentes. El worker sí generó una nueva (`00014-lq2`).

### 59.1 Verificación de «última versión» (2026-10-06)

**Código**: `HEAD` (`45b5c80`) no introduce cambios en `apps/`, `packages/`, `infra/` ni `contracts/`
respecto a `f6fbf3e` (commit con el que se construyó la release `v36`); los commits posteriores son
**solo documentación**. Por tanto las imágenes desplegadas corresponden al código más reciente.

**Esquema PostgreSQL**: el worker aplica `runMigrations` al arrancar y **aborta si falla**
(`apps/worker/src/main.ts`); la revisión `hotel-mcp-worker-00014-lq2` (`v36`) está en marcha, luego la
migración se aplicó. Comprobado además contra la base real con un job temporal de solo lectura
(imagen `worker:v36`, borrado tras usarlo):

| Comprobación | Resultado |
|---|---|
| Tablas de checklist | `room_cleaning_checklist_items`, `room_cleaning_checklists` ✅ |
| Columnas de ocupación en `reservations` | `adult_count`, `child_count`, `baby_count`, `pet_count`, `accessibility_count` ✅ |
| Restricción de `rooms.operational_status` | incluye `PENDING_CLEANING` ✅ |
| Semilla del catálogo de checklist | 6 filas ✅ |

**Componentes**:

| Componente | Versión desplegada | ¿Última? |
|---|---|---|
| web | `web:v36` (`hotel-mcp-web-00063-put`, tag `v36`) | Sí |
| worker | `worker:v36` (`hotel-mcp-worker-00014-lq2`) | Sí |
| mcp | `mcp:v36` (`hotel-mcp-mcp-00005-tnl`) | Sí |
| monitor | `monitor:v14` (worker pool `hotel-mcp-monitor`) | Sí — `apps/monitor` sin cambios desde `c0f00b0` (2026-09-25) e imagen del 2026-09-30 |

**Conclusión**: GCP sirve la última versión del proyecto para todos los componentes versionados y el
esquema de base de datos está al día.

---

## 60. Release v37 — ficha detalle por estado, y hallazgo del pin de tráfico (2026-10-06)

**Cambios funcionales** (commit `c8b4792`): la ficha detalle de habitación pasa a ser **dependiente del
estado** (`LIBRE · RESERVADA · OCUPADA · MANTENIMIENTO · PENDIENTE_LIMPIEZA`). Se corrigieron tres
carencias reales: la API ya devuelve `state`; la ocupación se deriva de `nfts.status = CHECKED_IN` (noche
de hoy) y no de `reservations.status`, que no admite ese valor; y los cuatro iconos del calendario se
muestran siempre (color = hecho, apagado = no hecho). Sin cambios de esquema.

**Hallazgo crítico — el tráfico estaba pinneado a revisiones antiguas.** Al verificar la release se
descubrió que **web y mcp no servían las imágenes recién desplegadas**, pese a que `gcloud run deploy`
informaba de «serving 100 percent of traffic»:

| Servicio | Revisión que servía | Imagen real | ¿Era la nueva? |
|---|---|---|---|
| web | `hotel-mcp-web-00063-put` (etiqueta `v36`) | build del **00:49**, anterior a todo el trabajo | **NO** |
| mcp | `hotel-mcp-mcp-00005-tnl` | build anterior | **NO** |
| worker | `hotel-mcp-worker-00015-64w` | `worker:v37` | Sí |

Las revisiones nuevas se creaban correctamente (`00044-dnw`, `00008-kps`) pero quedaban al **0 %**: el
servicio conserva la configuración de tráfico **pinnada por revisión** cuando no se usa `--to-latest`, el
mismo patrón ya documentado en §56. El worker escapó porque su plantilla siempre cambió.

**Consecuencia**: la verificación de la release `v36` (health 200 + esquema migrado) fue **insuficiente**:
el health lo servía una revisión antigua igualmente sana, y el esquema lo aplica el **worker** (que sí se
desplegó). La web llevaba desde el 00:49 sin los cambios de recepción.

**Corrección aplicada**: mover el tráfico **explícitamente** a la revisión nueva de cada servicio.

| Servicio | Revisión final (100 %) | Imagen |
|---|---|---|
| web | `hotel-mcp-web-00044-dnw` (etiqueta `v37`) | `web@sha256:626d565e…` |
| worker | `hotel-mcp-worker-00015-64w` | `worker@sha256:2db9a178…` |
| mcp | `hotel-mcp-mcp-00008-kps` | `mcp@sha256:7ce0517f…` |

**Verificación (nueva y concluyente)**: además del health, se comprueba que el **código servido** es el
nuevo, inspeccionando los *bundles* estáticos de la revisión:

| Marcador exclusivo de v37 | Antes (`00063-put`) | Después (`00044-dnw`) |
|---|---|---|
| `room-detail-state` | 0 | **1** |
| `preArrivalHint` | 0 | **1** |
| `calendarEmpty` | 0 | **1** |
| `pendingCleaningHint` | 0 | **1** |

`/health/ready` → 200 READY (postgres, redis, polygonRPC UP).

**Lección operativa**: tras cada `gcloud run deploy`, comprobar **la imagen de la revisión que sirve**
(`gcloud run revisions describe <rev> --format=value(spec.containers[0].image)`) o que el bundle servido
contiene un marcador del cambio. El mensaje «serving 100 percent of traffic» de `gcloud` **no** garantiza
que la revisión nueva sea la que atiende.

---

## 61. Release v38 — formularios y fichas flotantes en las suites de personal (2026-10-06)

**Cambios funcionales** (commit `aeee4f2`): todas las fichas y formularios de las suites de **Admin,
Recepción, Mantenimiento y Ama de llaves** pasan a ser **diálogos flotantes** con estructura de
**título · cuerpo · pie**. Se añade el componente compartido `components/ui/ModalShell.tsx` (con
`useModalDialog`) y se convierten **29 fichas**. Sin cambios de esquema.

**Builds (Cloud Build)**:

| Componente | Imagen | Estado |
|---|---|---|
| web | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:v38` | ✅ SUCCESS |
| worker | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/worker:v38` | ✅ SUCCESS |
| mcp | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/mcp:v38` | ✅ SUCCESS |

**Despliegue y tráfico** (esta vez el tráfico se movió **explícitamente**, aplicando la lección del §60):

| Servicio | Revisión sirviendo | Tráfico | Imagen |
|---|---|---|---|
| web | `hotel-mcp-web-00045-t8m` (etiqueta `v38`) | 100 % | `web@sha256:154c134c…` |
| worker | `hotel-mcp-worker-00016-gsq` | 100 % | `worker@sha256:65cf9076…` |
| mcp | `hotel-mcp-mcp-00009-sjx` | 100 % | `mcp@sha256:496ae0ef…` |

Procedimiento: `--no-traffic` al desplegar → etiqueta de canario `v38` → verificación de salud y de
código servido → `update-traffic --to-revisions=…=100`. La etiqueta `v37`, que quedaba apuntando a la
revisión anterior, se reemplazó por `v38`.

**Verificación post-despliegue**:

| Comprobación | Resultado |
|---|---|
| `/health/ready` web | 200 READY (postgres, redis, polygonRPC UP) |
| Canario `v38` | 200 READY antes de mover tráfico |
| Código servido (bundles de `/recepcion`) | marcadores exclusivos de v38 presentes: `checkin-qr-dialog`, `checkout-charge-dialog`, `activities-book-dialog`, `room-detail-footer` |
| Mismo control sobre la revisión anterior | los cuatro marcadores ausentes (confirmaba que v37 seguía sirviendo) |
| Revisión e imagen real de cada servicio | comprobadas con `gcloud run revisions describe` |

---

## 62. Release v39 — conexión de billetera: MetaMask no se reconocía (2026-10-06)

**Defecto**: la aplicación no reconocía MetaMask. **Causa**: `providers.tsx` creaba la configuración de
wagmi con `ssr: true`, y `@wagmi/core` omite el descubrimiento EIP-6963 en ese caso
(`if (!ssr && mipd)`); además `connect()` buscaba `id === "metaMask"`, cuando el id real de una cartera
descubierta es su RDNS (`io.metamask`). Detalle en `estado_proyecto.md` §13.

**Alcance**: solo `apps/web`. Se construyó y desplegó **únicamente la web**; worker y mcp no cambian
(`apps/worker`, `apps/mcp` y `packages/shared` no se tocaron).

| Componente | Imagen | Estado |
|---|---|---|
| web | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:v39` | ✅ SUCCESS (build `367b4716`) |
| worker | `worker:v38` (sin cambios) | vigente |
| mcp | `mcp:v38` (sin cambios) | vigente |

**Despliegue**:

| Servicio | Revisión sirviendo | Tráfico | Imagen |
|---|---|---|---|
| web | `hotel-mcp-web-00046-9t9` (etiqueta `v39`) | 100 % | `web@sha256:ae1c38ac…` |
| worker | `hotel-mcp-worker-00016-gsq` | 100 % | `worker@sha256:65cf9076…` |
| mcp | `hotel-mcp-mcp-00009-sjx` | 100 % | `mcp@sha256:496ae0ef…` |

**Verificación**:

| Comprobación | Resultado |
|---|---|
| `/health/ready` canario y producción | 200 READY (postgres, redis, polygonRPC UP) |
| Marcador de código `io.metamask` en canario v39 | presente |
| Marcador `io.metamask` en v38 (antes de mover) | ausente |
| Marcador `io.metamask` en producción tras mover | presente ✅ |
| Regresión automatizada | `wallet-discovery.test.ts`: con `ssr:false` descubre `io.metamask`; con `ssr:true` no |
| Suite web | **714/714 OK** |

## 63. Release v40 — asistente IA de la v3 en producción (2026-10-08)

Primera release que pone el **asistente conversacional** (v3) al servicio del huésped. Hitos H1-H4 del
plan de la v3; el despliegue es el H5.

**Alcance**: `apps/web` (asistente) y `apps/mcp` (quinta herramienta `searchHotelManuals`). El worker no
cambia, pero **sí se reconstruyó el MCP**: el índice de conocimiento va compilado en la imagen, así que
sin reconstruirlo el servicio seguiría con cuatro herramientas.

| Componente | Imagen | Build |
|---|---|---|
| web | `…/hotel-mcp/web:v40` (`sha256:b064176d…`) | ✅ SUCCESS `93fdc5a2` (3 m 39 s) |
| mcp | `…/hotel-mcp/mcp:v40` (`sha256:36eecc02…`) | ✅ SUCCESS `3f980abe` (2 m 19 s) |
| worker | `worker:v38` (sin cambios) | vigente |

**Cambios de infraestructura**

| Cambio | Detalle |
|---|---|
| API habilitada | `aiplatform.googleapis.com` (gratuita y reversible; sin recursos creados) |
| IAM | `roles/aiplatform.user` a `hotel-mcp-run@hotel-mcp.iam.gserviceaccount.com`. El asistente se autentica con la identidad del servicio: **no usa ningún secreto** |
| Variables nuevas en la web | `ASSISTANT_PROVIDER`, `GOOGLE_CLOUD_PROJECT` (obligatoria: sin ella el asistente falla **en cerrado** con 503), `VERTEX_MODEL`, `VERTEX_LOCATION`, `VERTEX_MAX_OUTPUT_TOKENS`, `VERTEX_THINKING_BUDGET=0`, `ASSISTANT_MAX_INPUT_TOKENS`, `ASSISTANT_MAX_TURNS`, `ASSISTANT_MONTHLY_BUDGET_USD`, `ASSISTANT_BUDGET_MODE` |
| Scripts | `70-deploy-apps.sh`: opciones `--only=` y `--canary`; `f8-build-images.sh`: opción `--only=` (la release solo necesitaba dos de las cuatro imágenes) |

**Despliegue (canario, verificando antes de mover el tráfico)**

| Servicio | Revisión sirviendo | Tráfico | Revisión anterior (rollback) |
|---|---|---|---|
| mcp | `hotel-mcp-mcp-00013-daq` (etiqueta `canary`) | 100 % | `hotel-mcp-mcp-00009-sjx` |
| web | `hotel-mcp-web-00078-dec` (etiqueta `v39` en la anterior) | 100 % | `hotel-mcp-web-00046-9t9` (etiqueta `v39`) |
| worker | `hotel-mcp-worker-00016-gsq` | 100 % | — |

Orden: canario del MCP (0 %) → verificar 5 herramientas → mover tráfico del MCP → canario de la web
(0 %) → verificar el asistente → mover tráfico de la web. El **tráfico se comprobó explícitamente**
en ambos servicios: el incidente de la release v37 fue precisamente tráfico pinneado a revisiones
antiguas.

**Verificación**

| Comprobación | Resultado |
|---|---|
| `tools/list` del MCP canario | **5 herramientas**, incluida `searchHotelManuals` ✅ |
| `tools/list` del MCP en su URL estable, tras mover | 5 herramientas ✅ |
| Asistente en el canario web | 200 con respuesta citada: «…*Manual del comprador §6. Revender una noche…*», `domainToolCalls: 1` ✅ |
| Procedimiento del hotel (defecto de H4) | «¿Cómo conecto mi cartera y me pongo en la red?» → responde con pasos ✅ (antes: «No puedo ayudarte con eso») |
| 5 peticiones seguidas a producción | 200 · 1,30 / 1,63 / 1,66 / 1,69 / 1,78 s |
| Telemetría en Cloud Logging | `event=assistant_request` con modelo, tokens, `costUsd` y latencia ✅ |
| **PII en los logs** | Petición con nombre, correo y móvil → **0 coincidencias** en los logs; la línea registra solo las categorías (`correo;telefono;nombre`) ✅ |
| `cachedInputTokens` | 0 en todas las muestras: Vertex **no** sirve caché de contexto para estas peticiones |

**Hallazgo: el *cold start* se paga en la primera pregunta.** Con `min-instances=0` en la web y en el
MCP, la primera petición tras un rato de inactividad midió **7,0 s y 9,7 s** (arranque de contenedores +
llamada al modelo), y las siguientes **~1 s** (973 y 1 140 ms internos). RNF-25 exige p95 ≤ 2,5 s **con
instancias calientes**, así que se cumple en caliente, pero la primera pregunta de la mañana es lenta.
Alternativas, por coste: dejar `min-instances=1` (~coste fijo), un *warm-up* periódico, o asumirlo y
documentarlo (lo elegido para el piloto, que es lo que RNF-25 pide documentar).

**Ajuste posterior (mismo día, decisión A3)**: la web pasó a `ASSISTANT_BUDGET_MODE=hard` con el
techo de 5 USD/mes → revisión **`hotel-mcp-web-00048-lz8`** sirviendo el 100 % (imagen `web:v40`
sin cambios; solo variables de entorno). Verificado que el asistente sigue respondiendo con citas.

**Rollback**: `gcloud run services update-traffic <servicio> --to-revisions=<revisión anterior>=100`.
Las revisiones v39 (web) y v38 (mcp) siguen desplegadas y arrancadas en frío, así que la vuelta atrás
es inmediata.

## 64. Release v41 — manual del huésped relleno con lo que el sistema sabe (2026-10-08)

El manual del huésped era una plantilla: el asistente no podía responder sobre el propio hotel. Se han
redactado los apartados que **dependen del sistema** a partir del funcionamiento real (manuales de los 17
casos y código), y se han dejado **solo** los que decide el hotel.

| Apartado | Estado |
|---|---|
| 2. Entrada y salida | Escrito (entrada digital, sin firma al salir, el sistema no fija horas) |
| 3. Tu noche y el código QR | Escrito (resguardo de 7 días y un solo uso, firma de 2 minutos, sin lector de cámara: recepción pega el texto) |
| 4. Servicios | Escrito lo del sistema (extras y cuenta); el catálogo y los precios siguen pendientes |
| 5. Normas | Escrito lo del sistema (la habitación queda pendiente de limpieza) |
| 6. Si algo va mal | Escrito lo del sistema + 112; a quién avisar y el horario, pendientes |
| 7. Reventa | Escrito y **verificado en el contrato**: precio lo pone el huésped, comisión **5 % / 10 % fija e inmutable** |
| 8. Preguntas frecuentes | Escritas las del sistema |
| 1. Dónde estamos | **Pendiente**: es dato del hotel y **no se ha indexado** (verificado) |

**Alcance**: solo `apps/mcp` (el contenido vive en el índice de conocimiento, que va dentro de la imagen).

| Componente | Imagen | Build |
|---|---|---|
| mcp | `…/hotel-mcp/mcp:v41` | ✅ SUCCESS `2daf7359` (2 m 43 s) |
| web | `web:v40` (sin cambios) | vigente |
| worker | `worker:v38` (sin cambios) | vigente |

**Despliegue**: canario `hotel-mcp-mcp-00015-mag` (0 %) → verificado que anuncia las 5 herramientas →
tráfico movido. Revisión anterior para rollback: `hotel-mcp-mcp-00013-daq`.

**Índice**: 188 → **196 fragmentos** (cliente 161 · recepción 17 · propietario 18). El apartado 1 **no** se
indexó (solo tiene comentarios), así que el asistente sigue sin poder inventar una dirección.

**Verificación en producción**

| Pregunta | Antes | Ahora |
|---|---|---|
| «¿Qué se queda el hotel de una reventa?» | «Pregunta en recepción» | «Un 5 % en habitaciones simples y dobles, y un 10 % en suites» ✅ |
| «¿Tengo que firmar algo al salir?» | Sin respuesta | «No… la salida no requiere firma ni cartera. El cobro se hace en el mostrador» ✅ |
| «¿Cuál es la dirección exacta?» | No la sabe | **Sigue sin saberla** (correcto: no se ha inventado) ✅ |

**Observación de calidad (no bloqueante)**: al preguntar por la duración del resguardo, el asistente
respondió que es de un solo uso pero **omitió los 7 días**; y una cita apuntó a una sección distinta de la
fuente usada. Son matices de resumen del modelo, no errores de contenido.

## 65. Release MCP v42 — la comisión de reventa ya no se pierde (2026-10-08)

**Defecto**: a «¿qué se queda el hotel de una reventa?» el asistente respondía a veces sin la cifra y, en
alguna ocasión, negaba que existiera comisión (el contrato cobra un 5 %/10 % inmutable). Detalle en
`estado_proyecto.md` §14.16.

**Causa**: la palabra «comisión» no existía en el corpus (decía «porcentaje»), así que la búsqueda
devolvía fragmentos sin la cifra; y en el apartado de reventa la cifra quedaba **más allá de los 600
caracteres** de extracto que ve el modelo.

**Alcance**: solo `apps/mcp` (contenido del índice y búsqueda).

| Componente | Imagen | Build |
|---|---|---|
| mcp | `…/hotel-mcp/mcp:v42` | ✅ SUCCESS `f8ba27da` (2 m 11 s) |
| web | `web:v40` (sin cambios; el prompt experimental se revirtió antes de desplegarse) | vigente |

**Despliegue**: canario `hotel-mcp-mcp-00017-wow` → A/B con el modelo real contra el canario
(**6/6** respuestas con la cifra, frente a 4/6) → tráfico movido. Rollback: `hotel-mcp-mcp-00015-mag`.

**Verificación en producción**

| Pregunta | Resultado |
|---|---|
| «¿Qué comisión se queda el hotel si revendo mi noche?» | «…un 5 % en habitaciones simples y dobles, y un 10 % en suites. Esta comisión está fijada en el contrato. *Manual del huésped §7*» ✅ |

**Limpieza de revisiones**: se borraron `hotel-mcp-web-00081-sih` y `hotel-mcp-web-00082-pid`, del prompt
experimental que empeoraba las respuestas, y se retiró su etiqueta `canary`.

## 66. Release MCP v44 — recuperación por párrafos (2026-10-08)

**Motivo**: el generador troceaba por apartados (hasta 1200 caracteres) y el buscador solo entrega los
**primeros 600** de cada fragmento, así que la mitad del contenido no llegaba al modelo: se perdían
cifras y frases concretas.

**Cambio** (solo `apps/mcp`): troceado por **párrafos** (objetivo 500, tope 800) para que el extracto
cubra el fragmento entero, conservando el título del apartado —**las citas no cambian**— y
deduplicación *por documento (máx. 2)* en lugar de por sección. Índice: **197 → 301 fragmentos**.

| Componente | Imagen | Build |
|---|---|---|
| mcp | `…/hotel-mcp/mcp:v44` | ✅ SUCCESS `a4d99c50` (2 m 20 s) |
| web | `web:v40` (sin cambios) | vigente |

**Despliegue**: canario `hotel-mcp-mcp-00021-tis` → verificado → tráfico movido. Rollback:
`hotel-mcp-mcp-00019-nex` (v43).

**Verificación (arnés de fidelidad, 26 muestras)**

| Configuración | Correctas | Contradicen |
|---|---|---|
| Apartados (v43) | 69,2 % | 2 |
| **Párrafos (v44)** | **76,9 %** | **1** |

La contradicción grave (afirmar que el cobro de la reventa es automático) desapareció. Queda una
contradicción de menor daño (decir que el resguardo no tiene duración definida) y tres debilidades
recurrentes. Suite del MCP: **75/75**.

## 67. Release v45 — artefactos alineados con el commit publicado (2026-10-08)

**Motivo**: las imágenes que estaban sirviendo (`web:v40`, `mcp:v44`) se construyeron desde **árboles de
trabajo**, no desde un commit, así que en producción corría algo que **no correspondía a ninguna revisión
del repositorio**. Esta release reconstruye ambos servicios desde el commit publicado `757ee69` para que
«lo que está en producción» sea una revisión trazable.

**Sin cambio funcional, y verificado**: el diff de código de producción entre el árbol de `web:v40` y
`757ee69` son **solo pruebas** (que no se empaquetan), y el MCP no había cambiado desde `v44`. Se
despliega igualmente para cerrar el hueco de trazabilidad.

| Componente | Imagen | Build |
|---|---|---|
| web | `…/hotel-mcp/web:v45` | ✅ SUCCESS `23cb31d8` |
| mcp | `…/hotel-mcp/mcp:v45` | ✅ SUCCESS `49bc51af` |
| worker | `worker:v38` (sin cambios) | vigente |

| Servicio | Revisión sirviendo | Tráfico | Rollback |
|---|---|---|---|
| mcp | `hotel-mcp-mcp-00023-cal` | 100 % | `00021-tis` (v44) |
| web | `hotel-mcp-web-00085-wor` | 100 % | `00048-lz8` (v40) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| `tools/list` del canario del MCP | 5 herramientas ✅ |
| Asistente en el canario web | 200 con la comisión correcta (5 %/10 %) ✅ |
| Producción: comisión de reventa | «un 5 % en habitaciones simples y dobles, y un 10 % en suites… fijada en el contrato» ✅ |
| Producción: salida sin firma | «No… la salida no requiere firma ni cartera. El cobro se hace en el mostrador» ✅ |
| Producción: dato que no tenemos | «No encuentro información sobre la dirección exacta… preguntar en recepción» ✅ (**no inventa**) |
| Telemetría | `assistant_request` con modelo, ~2 600 tokens de entrada, coste ≈0,0003 USD y latencia 806-1 028 ms ✅ |

**Nota**: en la prueba del canario, la pregunta por la **duración del resguardo** volvió a responder «no
tiene una duración fija» en vez de los 7 días. Es la **contradicción conocida** que dejó medida el arnés de
fidelidad (`estado_proyecto.md` §14.17-14.18), no un defecto nuevo de esta release.

---

## 68. Release v46 — asistente IA global (incremento v4) en producción (2026-10-09)

**Qué se desplegó.** El incremento **v4** (`98ef78d`): el asistente deja de vivir solo en `/asistente` y
pasa a estar en toda la plataforma (icono flotante en escritorio, avatar en la cabecera en móvil), con los
avatares de marca y con las consultas **materializadas en la página** (el catálogo acepta el filtro por
URL). Solo cambia **`apps/web`**: `mcp` (v45), `worker` (v38) y `monitor` se quedan como estaban.

**Cómo se construyó (lección de §67 aplicada).** La imagen se construyó desde un **árbol de trabajo limpio
en el commit publicado** (`git worktree add /tmp/hotel-v46 98ef78d`), no desde el árbol de desarrollo: en
el árbol principal había cambios **ajenos** sin commitear (`packages/shared/src/db/migrator.ts`,
`RepoTecnico/base_datos.sql`) que **no debían viajar** a producción. El único fichero que se copia al
árbol limpio es el registro de despliegues (`packages/shared/deployments/*.json`), que está **gitignored
a propósito** (`.gcloudignore` lo conserva porque la imagen lo necesita).

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v46` | ✅ SUCCESS `1b25cd1c` | 3m46s |
| mcp | `mcp:v45` (sin cambios) | vigente | — |
| worker | `worker:v38` (sin cambios) | vigente | — |

**Despliegue por canario** (procedimiento de §26, que sigue vigente porque el tráfico de `web` ya estaba
fijado por nombre):

```bash
gcloud run deploy hotel-mcp-web --image=…/web:v46 --region=europe-west1 --no-traffic --tag=v46
# verificación del canario en https://v46---hotel-mcp-web-d6jlzeq5yq-ew.a.run.app
gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00087-vup=100 \
  --update-tags=canary=hotel-mcp-web-00087-vup
```

| Servicio | Revisión sirviendo | Tráfico | Rollback |
|---|---|---|---|
| web | `hotel-mcp-web-00087-vup` (`web:v46`) | 100 % | `hotel-mcp-web-00085-wor` (v45) |
| mcp | `hotel-mcp-mcp-00023-cal` (`mcp:v45`) | 100 % | `00021-tis` (v44) |
| worker | `hotel-mcp-worker-00010-jut` (`worker:v38`) | 100 % | sin cambios |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario: rutas `/`, `/catalogo`, `/catalogo?tipo=simple`, `/asistente`, `/recepcion`, `/health/ready` | **200** en todas; `READY` en salud ✅ |
| Canario: widget en el HTML | `assistant-launcher` (escritorio) + `assistant-header-trigger` (móvil) + `avatar_hotel_80x80.webp` ✅ |
| Canario: aviso del filtro | `/catalogo?tipo=simple` sirve `catalog-assistant-notice` («Resultados de tu consulta al asistente») ✅ |
| Canario: `/asistente` sin duplicar el acceso | 0 apariciones del lanzador ✅ |
| **Consulta real al asistente en el canario** | «¿qué habitaciones sencillas hay disponibles?» → `domainToolCalls: 1`, lista de noches reales y `pageAction = {"kind":"catalog","href":"/catalogo?tipo=simple",…}` ✅ (**la consulta se ve en la página**) |
| Tras promover: revisión que sirve e imagen | `00087-vup` · `web:v46` (comprobado en el `describe`, no solo en el `deploy`) ✅ |
| Producción: regresión de rutas | `/`, `/catalogo`, `/catalogo?tipo=simple`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico`, `/recepcion`, `/health/ready` → **200** ✅ |
| Producción: widget servido | `assistant-launcher` + los dos avatares presentes en el HTML de `/` ✅ |
| Otros servicios | `mcp:v45` y `worker:v38` intactos ✅ |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00085-wor=100` (revisión `v45`, viva y con estado `True`). El tag `canary`
se movió a la revisión nueva; el tag `v39` de la revisión `00046-9t9` (sin tráfico) no se toca.

**Nota de alcance.** El back-office (`admin/**`) conserva su plantilla y **no** monta el asistente: es la
decisión D-83 del incremento (públicas + recepción), no un olvido.

---

## 69. Release v47 — la compra no puede fallar en silencio (2026-10-10)

**Qué se desplegó.** El endurecimiento del flujo de compra a raíz de la verificación del reporte
«al hacer una reserva la wallet da la transacción por fallida pero la plataforma la agrega a Mis
noches» (commit `a2c7696`): motivo real del fallo (D1), recibo contrastado con el `Transfer` de la
noche comprada (D2), guarda única de firma (D3), aviso de minado condicional (D4) y estado
**«no verificable»** para distinguir «revirtió» de «no se pudo leer el recibo» (D5). El caso
concreto quedó cerrado en el informe: la transacción del usuario **se asentó** (`ownerOf` suyo) y
la plataforma mostraba la verdad. Solo cambia **`apps/web`**; `mcp` (v45), `worker` (v38) y
`monitor` se quedan como están.

**Cómo se construyó.** Imagen desde un **árbol de trabajo limpio** en el commit del arreglo
(`git worktree add /tmp/hotel-v47 a2c7696`), porque el árbol principal tiene cambios **ajenos** sin
commitear (`packages/shared/src/db/migrator.ts`, `RepoTecnico/base_datos.sql`) que no deben viajar
a producción. El registro de despliegues (`packages/shared/deployments/*.json`, gitignored) se
copia al árbol limpio, igual que en v46.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v47` | ✅ SUCCESS `4cc57502` | 4m28s |
| mcp | `mcp:v45` (sin cambios) | vigente | — |
| worker | `worker:v38` (sin cambios) | vigente | — |

**Despliegue por canario** (procedimiento de §26/§68):

```bash
gcloud run deploy hotel-mcp-web --image=…/web:v47 --region=europe-west1 --no-traffic --tag=v47
gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00089-sor=100 \
  --update-tags=canary=hotel-mcp-web-00089-sor
```

| Servicio | Revisión sirviendo | Tráfico | Rollback |
|---|---|---|---|
| web | `hotel-mcp-web-00089-sor` (`web:v47`) | 100 % | `hotel-mcp-web-00087-vup` (v46) |
| mcp | `hotel-mcp-mcp-00023-cal` (`mcp:v45`) | 100 % | sin cambios |
| worker | `hotel-mcp-worker-00010-jut` (`worker:v38`) | 100 % | sin cambios |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario: rutas `/`, `/catalogo`, `/catalogo?tipo=simple`, `/reservar`, `/mis-noches`, `/reventa`, `/asistente`, `/health/ready` | **200** en todas; salud `READY` (postgres/redis/RPC `UP`) ✅ |
| Canario: copy D4 nueva | «la transacción sigue en la red…» **×2** (catálogo + asistente) y la antigua «la reserva continúa» **0** ✅ |
| Canario: claves nuevas servidas | D5 `Comprobar de nuevo`, `No pudimos comprobar la reserva`; D1 `Esta noche ya está vendida o no está disponible`, `No pudimos leer el recibo de la transacción en la red` ✅ |
| Tras promover: revisión que sirve e imagen | `00089-sor` · `web:v47` (comprobado en el `describe`) ✅ |
| Producción: regresión de rutas | `/`, `/catalogo`, `/catalogo?tipo=simple`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico`, `/recepcion`, `/health/ready` → **200** ✅ |
| Producción: copy nueva servida y antigua ausente | igual que en el canario ✅ |
| Otros servicios | `mcp:v45` y `worker:v38` intactos ✅ |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00087-vup=100` (revisión `v46`, viva y con estado `True`).

**Alcance de la verificación.** La comprobación de la release es de **entrega** (imagen, rutas,
salud y copy servidos). El comportamiento nuevo de la compra (motivo real, recibo verificado,
estado «no verificable», guarda de firma) está cubierto por **pruebas herméticas** en la suite
(105 ficheros / 969 tests) y por la reproducción on-chain del informe
(`apps/web/scripts/verify-reserva-fallida.mts`); no se repitió una compra real en producción
para esta release.

---

## 70. Releases v47bis y v48 — el asistente prepara la reserva y la entrega a la billetera (2026-10-10)

**Qué se pidió.** Verificar que el asistente **prepara** la reserva y que ésta **se envía a firmar
con la billetera**. La verificación se hizo contra el despliegue real (Anvil de GCP, chainId 31337,
contrato `0xc66ab8…`) con una **billetera inyectada que firma y difunde de verdad**, usando la cuenta
4 del pool determinista (huésped simulado documentado en `BaseOperaciones/cuentas_anvil.md`,
`0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`).

### Hallazgo 1 · El asistente no preparaba la reserva (3 de cada 4 veces) y lo negaba en silencio

Con **v46**, el flujo natural de dos turnos (consultar disponibilidad → confirmar y preparar) medido
con 4 intentos espaciados (el limitador devuelve 429 si no se espacian) dio **1 de 4** preparadas. En
los tres fallos el modelo hizo **UNA** llamada de herramienta en vez de dos y respondió «el `tokenId`
que me has proporcionado no es válido».

**Causa.** La secuencia correcta es `checkAvailability` (que devuelve el `tokenId`) → `buildPurchaseTx`.
La regla del prompt decía «Una vez que el usuario lo confirme, llama a **buildPurchaseTx directamente**,
sin volver a pedir confirmación», y el resultado de herramientas de turnos anteriores **no viaja** en
la conversación (el cliente solo envía texto), así que el modelo se saltaba la consulta y **calculaba**
el tokenId por su cuenta, a menudo mal. El MCP y el validador server-side estaban bien: comprobados
con el mismo `tokenId` contra la cadena real (`{ok:true}`) y con una sonda directa al MCP desplegado
(`priceOf` 0,05 ETH, `soldOnce` false, `tx` correcta).

**Corrección** (`9caadb3`): la regla pasa a exigir obtener el `tokenId` con `checkAvailability` y
llamar después a `buildPurchaseTx` con ESE `tokenId`, sin calcularlo ni inventarlo, y prohíbe llamar a
`buildPurchaseTx` si el `tokenId` no viene de una herramienta del **mismo turno**. Guardia nuevo en
`prompt.test.ts`.

### Hallazgo 2 · La compra preparada se perdía: el widget navegaba y cerraba el panel

Medido con la corrección del prompt desplegada (v47): turno 1 → el asistente consulta el catálogo y el
widget **navega** a `/catalogo?…&buscar=101` y cierra el panel (es la función del incremento v4). En el
turno 2 el flujo bueno usa **dos** herramientas y `checkAvailability` es de catálogo, así que volvía a
producir acción de página: el servidor preparaba la reserva y el **panel de firma no llegaba a verse**
(comprobado en navegador: URL de catálogo, panel cerrado, `purchase-handoff` ausente). El defecto estaba
latente antes porque el modelo se saltaba `checkAvailability`; al arreglar el prompt quedó al descubierto.

**Corrección** (`084fab8`): `pageActionForTurn` — si el turno dejó una compra preparada, la acción de
página es `null`. El panel de firma es el siguiente paso del usuario; el catálogo puede esperar. La
navegación se mantiene para los turnos que solo consultan.

### Releases

| Componente | Imagen | Build | Nota |
|---|---|---|---|
| web | `web:v47` | `b279d284` (3m41s) | Desde `9caadb3`. **Reutilizó el tag `v47`**: la imagen de §69 (build `4cc57502`, revisión `00089-sor`) se conserva por *digest* y se ha re-etiquetado como **`web:v47-compra`** para no perder la traza |
| web | `web:v48` | `b009382d` (3m46s) | Desde `084fab8` (incluye `a2c7696` de §69 + las dos correcciones de esta línea) |
| mcp / worker / monitor | `mcp:v45` · `worker:v38` | vigentes | sin cambios |

Ambas imágenes se construyeron desde un **árbol de trabajo limpio en el commit** (`git worktree`), con
el registro de despliegues copiado (gitignored), igual que en §68-§69.

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00093-zaj` | `web:v48` | **100 %** | `hotel-mcp-web-00091-nev` (v47bis) |
| web (histórico) | `00091-nev` (0 %) · `00089-sor` (0 %) · `00087-vup` (0 %) | v47bis · v47 · v46 | 0 % | — |
| mcp | `hotel-mcp-mcp-00023-cal` | `mcp:v45` | 100 % | `00021-tis` (v44) |
| worker | `hotel-mcp-worker-00010-jut` | `worker:v38` | 100 % | sin cambios |

### Verificación

| Comprobación | Resultado |
|---|---|
| Sonda directa al MCP desplegado (`listAvailableNights`, `checkAvailability`, `buildPurchaseTx`) | Lista noches, confirma `10120261010` disponible a 0,05 ETH y devuelve `buy(tokenId)` con `to`/`value`/`chainId` correctos ✅ |
| Validador server-side contra la cadena real (mismo código que producción) | `{ok:true, reasons:[]}` con la tx que devuelve el MCP ✅ |
| **Flujo natural de compra, v46 (antes)** | **1/4** preparadas; los 3 fallos con una sola herramienta y texto «tokenId no válido» ❌ |
| **Canario v47bis (prompt corregido)** | **4/4** preparadas, todas con `tool=2` (checkAvailability → buildPurchaseTx), tokenId/precio correctos y texto acorde ✅ |
| **Producción v48, flujo natural** | **2/2** preparadas con `tool=2`, `tokenId` real y **`pageAction: null`** en el turno de compra (prioridad del handoff) ✅ |
| Navegación de la consulta (incremento v4) sigue viva | Turno de disponibilidad → `pageAction = /catalogo?desde=…&hasta=…&buscar=101` ✅ |
| **Compra REAL firmada y difundida** (navegador, v46) | Noche `10120261010` comprada por `0x15d3…6A65`: `eth_sendTransaction` recibida por la billetera, firma y difusión `0x05387364…bd25f249`, recibo **success** (bloque 503, 112 878 gas), `ownerOf` = comprador y `soldOnce = true`; la UI mostró «¡Noche reservada!» con su recibo ✅ |
| El catálogo refleja la venta | La noche comprada desaparece de `/catalogo` (12 tarjetas antes, sin `10120261010` después) ✅ |
| **Handoff verificado en navegador sobre v48** (canario) | Panel **permanece abierto**, «Reserva preparada — revisa y firma» con habitación/noche/token/contrato/0,05 ETH, «Firmarás con la wallet conectada 0x15d3…6A65» y «Firmar reserva» **habilitado** tras la verificación on-chain ✅ |
| Petición de firma en v48 | Al pulsar «Firmar reserva», la billetera recibe `eth_sendTransaction` (`to` = contrato, `value` = `0xb1a2bc2ec50000`); al **cancelar** el panel muestra el error y **nada se difunde** (`ownerOf`/`soldOnce` sin cambios) ✅ |
| Ambos trabajos conviven en producción | Copy de §69 (D4/D5) y widget del incremento v4 servidos en el mismo HTML ✅ |
| Regresión de rutas | `/`, `/catalogo`, `/asistente`, `/recepcion`, `/health/ready` → **200** ✅ |

**Evidencia visual** en `RepoTecnico/evidencias/verificacion-reserva-asistente-2026-10-10/`:
`v48-2-handoff.png` (panel de firma sobre el catálogo), `v48-3-cancelada.png`, `verif-2-verificado.png`
y `verif-3-exito.png` (compra confirmada con recibo).

**Inventario consumido por la verificación.** La noche **`10120261010`** (habitación 101, 2026-10-10,
0,05 ETH) queda **vendida** al huésped simulado `0x15d3…6A65` en la cadena de pruebas. Es la única
noche consumida: las comprobaciones posteriores se hicieron cancelando la firma.

**Riesgo residual (no bloqueante).** El modelo (`gemini-2.5-flash-lite`, `thinking_budget: 0`) sigue
teniendo varianza de narración: en una muestra dijo «No puedo consultar la disponibilidad…» tras una
consulta que sí devolvió datos, y en §69 quedó medida la varianza equivalente en manuales. La
**preparación** ya es fiable en las muestras tomadas (4/4 + 2/2), pero conviene medirla con el arnés de
fidelidad antes de subir el modelo de exigencia.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00087-vup=100` (v46, la última con el prompt anterior) o
`--to-revisions=hotel-mcp-web-00089-sor=100` (§69 sin las correcciones de esta línea).

---

## 71. Release v49 — Publicar habitación: gestión del día en flotante, fichas por planta y ribbons (2026-10-10)

**Qué se desplegó.** El rediseño de `/admin/habitacion/publicar` (commit `1a29701`): al elegir un día, la
gestión se abre en un **flotante** sobre el calendario; dentro, **una ficha por planta** con las
habitaciones en **cuadrícula**, cada una como **ribbon** mínimo (cabecera con número y tipo, cuerpo con
el estado del día y **check en el pie**). Solo cambia **`apps/web`**: `mcp` (v45) y `worker` (v38) se
quedan como están.

**Cómo se construyó.** Imagen desde un **árbol de trabajo limpio** en el commit publicado
(`git worktree add /tmp/hotel-v49 1a29701`), con el registro de despliegues copiado (gitignored), igual
que en §68-§70: en el árbol principal siguen los cambios **ajenos** sin commitear
(`packages/shared/src/db/migrator.ts`, `RepoTecnico/base_datos.sql`), que no viajan a la imagen.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v49` | ✅ SUCCESS `74b97cc1` | 4m38s |
| mcp | `mcp:v45` (sin cambios) | vigente | — |
| worker | `worker:v38` (sin cambios) | vigente | — |

**Despliegue por canario** (procedimiento de §26/§68):

```bash
gcloud run deploy hotel-mcp-web --image=…/web:v49 --region=europe-west1 --no-traffic --tag=v49
gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00095-qes=100 \
  --update-tags=canary=hotel-mcp-web-00095-qes
```

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00095-qes` | `web:v49` | **100 %** | `hotel-mcp-web-00093-zaj` (v48) |
| mcp | `hotel-mcp-mcp-00023-cal` | `mcp:v45` | 100 % | `00021-tis` (v44) |
| worker | `hotel-mcp-worker-00010-jut` | `worker:v38` | 100 % | sin cambios |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario: `/`, `/catalogo`, `/asistente`, `/admin/habitacion/publicar`, `/health/ready` | **200** y salud `READY` (postgres, redis, RPC `UP`) ✅ |
| Canario **sirve el build nuevo** (y la producción anterior no) | Las claves nuevas (`boardFloorTitle`, `boardFloorNone`, `boardRoomSelect`) y el texto «Sin planta» aparecen **1 vez en el canario y 0 en la v48** ✅ |
| Tras promover: revisión que sirve e imagen | `00095-qes` · `web:v49` (comprobado en el `describe`) ✅ |
| Producción: regresión de rutas | `/`, `/catalogo`, `/catalogo?tipo=simple`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico`, `/recepcion`, `/admin/habitacion/publicar`, `/health/ready` → **200** ✅ |
| Producción: señales del cambio servidas | `boardFloorTitle`, `boardFloorNone`, `boardRoomSelect`, «Sin planta» y el lanzador del asistente presentes ✅ |
| Otros servicios | `mcp:v45` y `worker:v38` intactos ✅ |

**Alcance de la verificación.** Es una comprobación de **entrega** (imagen, revisión que sirve, salud,
rutas y textos servidos). El comportamiento de la interfaz está cubierto por las **pruebas de render**
de la suite (10 del panel + 5 de la agrupación por plantas) y por la **captura con el CSS compilado**
documentada en `estado_proyecto.md` §16; **no** se ha recorrido el panel con sesión de operador (hace
falta credencial de back-office, que este entorno no tiene).

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00093-zaj=100` (v48, la anterior).

---

## 72. Release v50 — el asistente olvida al desconectar, nueva conversación y búsqueda siempre visible (2026-10-10)

**Qué se desplegó.** El commit `6f80242`: (1) al **desconectar la billetera** se cierra el panel del
asistente y se borra el contexto de la conversación; (2) **botón de nueva conversación** con su icono;
(3) **respaldo determinista** para que una búsqueda de habitaciones se vea siempre en la ventana del
navegador aunque el modelo no consulte el catálogo. Solo cambia **`apps/web`**: `mcp` (v45) y `worker`
(v38) se quedan como están.

**Cómo se construyó.** Imagen desde un **árbol de trabajo limpio** en el commit publicado
(`git worktree add /tmp/hotel-v50 6f80242`), con el registro de despliegues copiado (gitignored), igual
que en §68-§71: los cambios **ajenos** sin commitear (`packages/shared/src/db/migrator.ts`,
`RepoTecnico/base_datos.sql`) no viajan a la imagen.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v50` | ✅ SUCCESS `87fe2d44` | 4m47s |
| mcp | `mcp:v45` (sin cambios) | vigente | — |
| worker | `worker:v38` (sin cambios) | vigente | — |

**Despliegue por canario** (procedimiento de §26/§68):

```bash
gcloud run deploy hotel-mcp-web --image=…/web:v50 --region=europe-west1 --no-traffic --tag=v50
gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00097-qex=100 \
  --update-tags=canary=hotel-mcp-web-00097-qex
```

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00097-qex` | `web:v50` | **100 %** | `hotel-mcp-web-00095-qes` (v49) |
| mcp | `hotel-mcp-mcp-00023-cal` | `mcp:v45` | 100 % | `00021-tis` (v44) |
| worker | `hotel-mcp-worker-00010-jut` | `worker:v38` | 100 % | sin cambios |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario: `/`, `/catalogo`, `/asistente`, `/health/ready` | **200** y salud `READY` (postgres, redis, RPC `UP`) ✅ |
| Canario **sirve el build nuevo** (y la v49 que servía, no) | `Nueva conversación` y la clave `newChat` aparecen **1 vez en el canario y 0 en la v49** ✅ |
| Tras promover: revisión que sirve e imagen | `00097-qex` · `web:v50` (comprobado en el `describe`) ✅ |
| Producción: regresión de rutas | `/`, `/catalogo`, `/catalogo?tipo=simple`, `/reservar`, `/reventa`, `/mis-noches`, `/asistente`, `/ayuda`, `/historico`, `/recepcion`, `/health/ready` → **200** ✅ |
| Producción: señales servidas | `Nueva conversación`, `newChat`, el lanzador del asistente y el cambio de la v49 (`Sin planta`) presentes ✅ |
| **Producción · consulta real al asistente** | «¿qué habitaciones sencillas hay disponibles?» → `domainToolCalls: 1` y `pageAction = {"kind":"catalog","href":"/catalogo?tipo=simple",…}`: la búsqueda **se ve en la ventana** ✅ |
| Otros servicios | `mcp:v45` y `worker:v38` intactos ✅ |

**Alcance de la verificación.** Es una comprobación de **entrega** (imagen, revisión que sirve, salud,
rutas, textos servidos) más **una llamada real** al endpoint para la acción de página. El resto del
comportamiento (cierre y borrado al desconectar, nueva conversación) se verificó en **navegador** con el
build local y billetera EIP-1193 inyectada, y con las pruebas de la suite
(`estado_proyecto.md` §17).

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00095-qes=100` (v49, la anterior).

---

## 73. Release v51 — quema de caducadas: integridad, aviso y señal de vida (2026-10-10)

**Qué se desplegó.** El commit `357ff39`, con los **quick wins críticos** de la auditoría V6 del
proceso de quema (`RepoTecnico/INFORME_OPTIMIZACION_V6.md`): **H-01** (un error de transporte del RPC
dejaba de ser un veredicto de negocio: ya no marca `BURNED` inventario vivo), **H-05** (un ciclo con
todas las candidatas descartadas ya no se declara `COMPLETED` en silencio: `SKIPPED_ALL` + alerta +
cerrojo liberado) y **H-04** (señal de vida en `/health`, aviso si falta la clave y pasada de
recuperación al arrancar), más **H-19** (el reloj de cadena degradado avisa). Solo **shared + worker**:
la web se reconstruye por consistencia de la release, sin cambios funcionales.

**Alcance del worker.** Entre la imagen vigente (`worker:v38`, commit `aeee4f2`) y este commit **no hay
ni un commit** que toque `apps/worker`/`packages/shared` (`git log aeee4f2..357ff39 -- apps/worker
packages/shared` → vacío), así que el nuevo worker lleva **v38 + estos arreglos** y nada más.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v51` | ✅ SUCCESS `7beac3b1` | 2m17s |
| worker | `…/hotel-mcp/worker:v51` | ✅ SUCCESS `7beac3b1` | 2m17s |
| mcp | `mcp:v45` (sin cambios) | vigente | — |

**Despliegue.** Web por canario (procedimiento de §26/§68) y worker directo (servicio de fondo; el
cerrojo diario impide que dos revisiones quemen a la vez durante el relevo):

```bash
gcloud run deploy hotel-mcp-web --image=…/web:v51 --region=europe-west1 --no-traffic --tag=v51
gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00099-ban=100 \
  --update-tags=canary=hotel-mcp-web-00099-ban
gcloud run deploy hotel-mcp-worker --image=…/worker:v51 --region=europe-west1   # sin --set-env-vars
```

El despliegue del worker se hace **solo con `--image`** a propósito: `--set-env-vars/--set-secrets`
reemplazan el conjunto completo y, como el script documentado no incluye las variables de quema, ese
camino apagaría la configuración en silencio (H-03).

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00099-ban` | `web:v51` | **100 %** | `hotel-mcp-web-00097-qex` (v50) |
| worker | `hotel-mcp-worker-00017-mrf` | `worker:v51` | 100 % | `hotel-mcp-worker-00010-jut` (v38) |
| mcp | `hotel-mcp-mcp-00023-cal` | `mcp:v45` | 100 % | sin cambios |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Typecheck y eslint | Limpios (shared sin errores; worker limpio) ✅ |
| Pruebas | Servicio de quema **19/19**, planificador **13/13**, salud del worker **6/6**, suite del worker **138/138**; web **1006/1006** con ramas **75,01 %** (umbral 73) ✅ |
| Canario web: `/`, `/catalogo`, `/asistente`, `/health/ready` | **200** y salud `READY` (postgres, redis, RPC `UP`) ✅ |
| Tras promover: regresión de rutas | Las 11 rutas y `/health/ready` → **200**; producción sirve `web:v51` ✅ |
| **Worker `/health` publica la señal nueva** | `"burn":{"scheduler":"disabled","lastRun":null}` en la revisión `00017-mrf` ✅ |
| Alcance | `mcp:v45` intacto ✅ |

**Consecuencia operativa (importante).** La señal de vida confirma en vivo lo que la auditoría
encontró: **la quema sigue DESACTIVADA en producción** (`scheduler: disabled`), porque el worker no
tiene `BURNER_WALLET_PRIVATE_KEY` ni la web `RELAYER_*`, aunque los secretos
(`hotel-burner-private-key`, `hotel-relayer-private-key`) ya existen. **Activar la quema es una
decisión de configuración pendiente** (QW-4) y, según el informe, debería hacerse después de cerrar
los hallazgos que quedan (H-02 custodia de roles, H-03 provisión de variables). Esta release **no la
activa**.

**Nota sobre el estado global del worker.** `/health` responde **503 con `emailDegraded: true`** porque
la revisión usa `SMTP_HOST=smtp.invalid` (entorno de pruebas): es un estado **preexistente y ajeno a
esta release**, no un efecto de la quema. La señal de quema se publica igualmente dentro de `details`.

**Deuda preexistente detectada (no de este cambio).** `packages/shared/src/documentation-guardian.test.ts`
falla en `HEAD` antes de este commit: `day-board.test.ts` (commit ajeno `c8b4792`) cita `CU-38`/`CU-39`
y el SRS no los cataloga. Queda registrado, no se ha tocado.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00097-qex=100` (web) y
`gcloud run deploy hotel-mcp-worker --image=…/worker:v38 --region=europe-west1` (worker).

---

## 74. Release v52 — F1 de vNext (esquema + auditoría + operaciones firmadas) y H-03/QW-4 (2026-10-10)

**Qué se desplegó.** El commit `017d268`, con tres bloques:

1. **F1 · Fundaciones de vNext**: 12 tablas nuevas, 19 columnas y 3 CHECK sobre 4 tablas existentes,
   semilla de 10 áreas comunes (4 críticas) y trigger append-only, portados al esquema que aplica
   `runMigrations` **y** al script raíz (texto idéntico, verificado por prueba); plan de reset y
   guiardián de paridad ampliados; repositorios nuevos de **auditoría con hash encadenado** y de
   **operaciones firmadas** (`operator_wallets` + `on_chain_signatures`, con nonce anti-replay).
2. **H-03/QW-4**: la configuración de quema queda provisionada (`.env.example`, manual y script de
   despliegue) y el script **avisa** cuando despliega con la quema apagada en vez de hacerlo en silencio.
3. **Documentación vNext**: análisis de arranque y revisión del DDL contra el plan (con rectificación de
   una lectura errónea mía, ya corregida en el propio análisis).

**Esto SÍ cambia el esquema de producción.** El worker aplica `runMigrations(pool)` **al arrancar**
(`apps/worker/src/main.ts:70`) y, si fallara, **no arranca** (registra `MIGRATION_FAILED`, cierra el pool
y lanza). Verificación previa a desplegar, porque el bloque redefine tres CHECK sobre tablas con datos:

| CHECK redefinida | Comprobación sobre datos vivos | Veredicto |
|---|---|---|
| `rooms_operational_status_check` | El conjunto nuevo (`CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`) es **superconjunto** del vigente (4 valores) | seguro ✅ |
| `preventive_tasks_validation_status_check` | `validation_status` es **columna nueva** (no existía en `HEAD`) ⇒ las filas vivas quedan `NULL`, y el CHECK admite `NULL` | seguro ✅ |
| `maintenance_incidents_reported_by_role_check` | `reported_by_role` es **columna nueva**; el `DROP CONSTRAINT IF EXISTS` es un no-op | seguro ✅ |

Además, las tres son un único `pool.query(INITIAL_SCHEMA_SQL)` con varias sentencias, que PostgreSQL
ejecuta en **transacción implícita**: o entra todo, o no entra nada. **Orden de despliegue**: primero el
worker (es quien migra), y solo después web y mcp.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v52` | ✅ SUCCESS `91ed3c0a` | 2m21s |
| worker | `…/hotel-mcp/worker:v52` | ✅ SUCCESS `91ed3c0a` | 2m21s |
| mcp | `…/hotel-mcp/mcp:v52` | ✅ SUCCESS `91ed3c0a` | 2m21s |

Se reconstruye también el **mcp** (a diferencia de las releases v49-v51) porque `@hotel/shared` cambió y
los tres servicios lo consumen.

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00101-xik` | `web:v52` | **100 %** | `hotel-mcp-web-00099-ban` (v51) |
| worker | `hotel-mcp-worker-00018-n64` | `worker:v52` | 100 % | `hotel-mcp-worker-00017-mrf` (v51) |
| mcp | `hotel-mcp-mcp-00016-v9t` | `mcp:v52` | 100 % | `hotel-mcp-mcp-00023-cal` (v45) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Typecheck, eslint y pruebas antes de construir | Limpios; **53 pruebas del ciclo F1** + 177 de repositorios; suite de `shared` 508/509 (el fallo es el guardián de documentación ajeno) ✅ |
| **Migración aplicada en producción** | El worker `00018-n64` está **sirviendo** (si `runMigrations` fallara no arrancaría), procesa la cadena (`lastBlock 533`) y **no hay `MIGRATION_FAILED`** en sus logs ✅ |
| Canario web: `/`, `/catalogo`, `/catalogo?tipo=simple`, `/asistente`, `/health/ready` | **200** y `postgres: UP` contra el esquema migrado ✅ |
| Tras promover: regresión de rutas | Las 12 rutas y `/health/ready` → **200** ✅ |
| Señales de releases anteriores conservadas | Lanzador del asistente, «Nueva conversación» y «Sin planta» presentes ✅ |
| Worker `/health` | `burn: {scheduler: "disabled", lastRun: null}` (H-04) y `lastBlock 533` ✅ |
| MCP `/health` | `200` con `block 533` ✅ |
| **Asistente end-to-end** (llamada real) | `domainToolCalls: 1` y `pageAction = /catalogo?tipo=simple` ✅ |

**Rollback.** Las imágenes se revierten por revisión (`update-traffic` para web; `run deploy --image` para
worker y mcp). **El esquema NO se revierte**: las 12 tablas y las columnas son aditivas y las revisiones
antiguas las ignoran; **no se debe ejecutar `resetDatabase()`** contra producción.

**La quema sigue DESACTIVADA** (`burn.scheduler: disabled`): la release no la activa; lo que cambia es
que ahora el script de despliegue lo **avisa** y la activación es explícita (`ENABLE_BURN_SCHEDULER=1` /
`ENABLE_RELAYER_BURN=1`).

---

## 75. Release v53 — vocabulario de roles (F1 · T1.5) y arreglo del estado `SKIPPED_ALL` (2026-10-11)

**Qué se desplegó.** El commit `90cae90`, con dos cosas:

1. **T1.5 · vocabulario de roles ampliado** a 8 (jefes con wallet, operarios de terminal y los
   heredados conservados), en la **fuente única** `packages/shared/src/domain/roles.ts`, con las listas
   duplicadas eliminadas (enum zod y validación del alta de operadores derivados del vocabulario),
   etiquetas i18n nuevas en es/en/ru y guardián propio.
2. **Arreglo de un fallo introducido en la v52**: el mapa `STATUS: Record<BurnCycleResult["reason"], number>`
   de `/api/admin/expired/burn` no incluía `SKIPPED_ALL` (se añadió al tipo en H-05 pero no al mapa), de
   modo que Next habría respondido **200** a un ciclo que descartó todas las candidatas —el fallo
   silencioso que H-05 prohíbe—, reintroducido en la capa HTTP. Corregido a **502**.

**Alcance del despliegue: solo la web.** Se comprobó que **ni el worker ni el mcp** consumen el
vocabulario de roles ni el enum derivado (`grep` en `apps/worker/src` y `apps/mcp/src`: sin
coincidencias), y la corrección del estado vive en una ruta de la web. Redesplegar el worker habría
reiniciado su listener de cadena y el mcp su servidor **sin ganancia funcional**, así que se quedan en
`v52` a propósito (criterio: se reconstruye y redespliega lo que cambia de comportamiento).

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v53` | ✅ SUCCESS `b3a224f4` | 4m01s |
| worker | `worker:v52` (sin cambios) | vigente | — |
| mcp | `mcp:v52` (sin cambios) | vigente | — |

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00103-viw` | `web:v53` | **100 %** | `hotel-mcp-web-00101-xik` (v52) |
| worker | `hotel-mcp-worker-00018-n64` | `worker:v52` | 100 % | `00017-mrf` (v51) |
| mcp | `hotel-mcp-mcp-00016-v9t` | `mcp:v52` | 100 % | `00023-cal` (v45) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Typecheck, eslint y pruebas antes de construir | `tsc --noEmit` limpio en **todo el monorepo**; eslint de `shared` 0 errores; **51 pruebas** del ciclo F1 y **57** de web relacionadas ✅ |
| Canario v53: `/`, `/catalogo`, `/asistente`, `/admin`, `/health/ready` | **200** y salud `READY` ✅ |
| Canario **sirve el build nuevo** (y la v52 que servía, no) | `roleHeadMaintenance` y «JEFE MANTENIMIENTO» aparecen **1 vez en el canario y 0 en la v52** ✅ |
| Tras promover: regresión de rutas | Las 13 rutas (incluida `/admin`) y `/health/ready` → **200**, `postgres: UP` ✅ |
| Señales de releases anteriores conservadas | «Nueva conversación» y «Sin planta» presentes ✅ |
| Asistente end-to-end | `domainToolCalls: 1` y `pageAction = /catalogo?tipo=simple` ✅ |
| Otros servicios | `worker:v52` y `mcp:v52` intactos; worker `/health` con `burn.scheduler=disabled` y `lastBlock 533` ✅ |

**Alcance de la verificación del arreglo.** El mapa `SKIPPED_ALL → 502` **no tiene camino de
verificación en vivo** en este entorno: la ruta exige sesión de `DEFAULT_ADMIN_ROLE` y la quema está
desactivada (responde 503 antes de llegar al ciclo). Queda verificado por el **compilador** —el mapa es
total sobre la unión de estados, y era justo lo que el typecheck señaló— y por las pruebas del ciclo.

**Impacto real del fallo corregido**: **ninguno en producción**, porque la quema está desactivada
(`burn.scheduler: disabled`); habría aparecido el día que se activara, presentando como éxito un ciclo
que no quemó nada.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00101-xik=100` (v52).

---

## 76. Release v54 — hooks antes del `return` en 5 componentes del back-office (2026-10-11)

**Qué se desplegó.** El commit `860f619`: la corrección de los **18 errores de lint** de la web (11 en
ficheros versionados y 7 en scripts sin seguimiento), cuyo núcleo es un **bug real y latente de React**
en cinco componentes del back-office (`ActivitiesAdmin`, `ContentAdmin`, `SuppliesAdmin`,
`PreventiveAdmin`, `ReviewsModeration`): tras los dos `return` tempranos (cargando / sin rol) se llamaban
`useState` y `useTranslations`. Como `useAdminSession` arranca con `isLoading = true`, el primer render no
los ejecutaba y el siguiente sí ⇒ React aborta con «Rendered more hooks than during the previous render».
Estaba **enmascarado** porque `AdminLayout` no monta los hijos mientras carga; cualquier render fuera de
ese gate habría reventado. Los hooks se mueven antes del primer `return` en los cinco.

**Alcance: solo la web** (el cambio está en componentes de la web; el worker y el mcp no lo consumen).

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v54` | ✅ SUCCESS `e8ecd73d` | 3m51s |
| worker | `worker:v52` (sin cambios) | vigente | — |
| mcp | `mcp:v52` (sin cambios) | vigente | — |

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00105-zaj` | `web:v54` | **100 %** | `hotel-mcp-web-00103-viw` (v53) |
| worker | `hotel-mcp-worker-00018-n64` | `worker:v52` | 100 % | `00017-mrf` (v51) |
| mcp | `hotel-mcp-mcp-00016-v9t` | `mcp:v52` | 100 % | `00023-cal` (v45) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Lint, typecheck y pruebas antes de construir | `pnpm --filter @hotel/web lint` → **0 errores** (6 avisos) y `pnpm lint` del monorepo **6/6, EXIT=0**; `tsc --noEmit` limpio; suite completa de la web **107 ficheros / 1007 pruebas en verde** ✅ |
| Canario v54: `/`, `/catalogo`, `/asistente`, `/admin`, `/health/ready` | **200** y salud `READY` ✅ |
| Canario **sirve un build distinto** de la v53 | El chunk del panel cambia de hash (`1001-cfead535a0038167.js` en v54 frente a `1001-88e8b2bb6962af0a.js` en v53) y la huella de la lista de chunks de `/admin` difiere (`626c63421ea8` vs `3593d8d66cae`) ✅ |
| Tras promover: regresión de rutas | Las 13 rutas (incluida `/admin`) y `/health/ready` → **200**, `postgres: UP` ✅ |
| El chunk nuevo ya se sirve en producción | `/_next/static/chunks/1001-cfead535a0038167.js` ✅ |
| Señales de releases anteriores conservadas | `roleHeadMaintenance`, «JEFE MANTENIMIENTO» y «Nueva conversación» presentes ✅ |
| Asistente end-to-end | `domainToolCalls: 1` y `pageAction = /catalogo?tipo=simple` ✅ |
| Otros servicios | `worker:v52` intacto (`burn.scheduler=disabled`, `lastBlock 533`) y `mcp:v52` intacto ✅ |

**Nota de método.** El `buildId` y los manifiestos de Next **no** aparecen en el HTML servido (payload
RSC), así que la comparación de artefacto se hizo por los **chunks JS** de `/admin`: es la evidencia de
que lo desplegado es un build distinto, no una simple repetición del anterior.

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00103-viw=100` (v53).

---

## 77. Release v55 — asistente: reserva por rango de fechas y busqueda visible en panel y catalogo (2026-10-13)

**Qué se desplegó.** El commit `c60a58d`, que cierra los tres puntos de la revisión del asistente:
(1) la búsqueda se refleja en el **navegador** (`pageAction` → `/catalogo` filtrado) y en el **panel**
(`highlights`, las noches reales del catálogo pintadas como fichas); (2) plantilla visual
(`MessageText` + `NightHighlights` con jerarquía); (3) **reserva en rango de fechas**: nueva herramienta
MCP `prepareStayTx` (una tx sin firmar por noche, todo o nada), validación server-side de cada tx,
`preparedPurchases[]` en la respuesta y panel `StayHandoff` (noches numeradas, total y una firma por
noche).

**Alcance: web + mcp** (el asistente vive en la web y la herramienta nueva en el MCP). El worker no se
tocó.

| Componente | Imagen | Build | Duración |
|---|---|---|---|
| web | `…/hotel-mcp/web:v55` | ✅ SUCCESS `0f45c7f0` | 4m19s |
| mcp | `…/hotel-mcp/mcp:v55` | ✅ SUCCESS `bfac0cf5` | 2m31s |
| worker | `worker:v52` (sin cambios) | vigente | — |

| Servicio | Revisión sirviendo | Imagen | Tráfico | Rollback |
|---|---|---|---|---|
| web | `hotel-mcp-web-00107-xoh` | `web:v55` | **100 %** | `hotel-mcp-web-00105-zaj` (v54) |
| mcp | `hotel-mcp-mcp-00017-728` | `mcp:v55` | **100 %** | `hotel-mcp-mcp-00016-v9t` (v52) |

**Método.** La imagen se construyó con `gcloud builds submit` desde un **worktree limpio** en `c60a58d`
(`git worktree add --detach`), no desde el árbol de trabajo: este tenía ~74 ficheros de otro trabajo en
curso (vNext, worker/monitor/shared) que **no debían entrar en la imagen**. Al worktree se copió el
registro de despliegue `packages/shared/deployments/31337.json` (ignorado por git pero que la imagen
necesita).

**Verificación**

| Comprobación | Resultado |
|---|---|
| MCP v55 `tools/list` | Expone **6 herramientas**, incluida `prepareStayTx` con `checkIn`/`checkOut`/`room`/`type` ✅ |
| MCP `prepareStayTx` 14→16 `type=simple` | Devuelve **2 noches** (`10120261014`, `10120261015`) y total `100000000000000000` wei ✅ |
| Canario web: `/health/ready`, `/`, `/asistente`, `/catalogo?tipo=simple` | **200** ✅ |
| Canario web · búsqueda (punto 1) | `pageAction = /catalogo?tipo=simple` **y** `highlights = 6` (navegador + panel) ✅ |
| Canario web · rango con habitación explícita | `preparedPurchases = 2` (`10120261014`, `10120261015`) y `preparedPurchase = 10120261014` (compatibilidad) ✅ |
| Canario web · rango sin habitación (por tipo) | `preparedPurchases = 2`; el modelo ya no responde «solo noches individuales» ✅ |
| Tras promover a producción | `/`, `/asistente`, `/health/ready`, `/catalogo` → **200**; búsqueda → `pageAction` + 6 `highlights`; rango → **2 compras preparadas** ✅ |
| Worker | `worker:v52` intacto (no se desplegó) ✅ |

**Nota.** El asistente no firma: `prepareStayTx` solo compone txs y el orquestador valida cada una
contra el precio on-chain antes de ofrecerla. La reserva se completa cuando el huésped firma **cada**
noche en su cartera.

**Rollback.** `gcloud run services update-traffic hotel-mcp-mcp --region=europe-west1
--to-revisions=hotel-mcp-mcp-00016-v9t=100` (v52) y, para la web, `gcloud run services update-traffic
hotel-mcp-web --region=europe-west1 --to-revisions=hotel-mcp-web-00105-zaj=100` (v54).

---

## 78. Release v56 — ventana de redeploy de C1: royalty configurable en producción (2026-10-13)

**Qué se desplegó.** La ventana de redeploy de C1 (ADR-27, RF-08): **contrato nuevo** con el royalty
configurable por `ROYALTY_ADMIN` + **web y mcp v56** apuntando a la dirección nueva. **Sin siembra**
(orden expresa del responsable): el catálogo queda **vacío** hasta que se registren habitaciones y se
minteen noches.

**Contrato (Anvil global, `chainId 31337`)**

| Elemento | Valor |
|---|---|
| `HotelNights` nuevo | **`0x532802f2F9E0e3EE9d5Ba70C35E1F43C0498772D`** (bloque 538) |
| Anterior D-06 (rollback, sigue on-chain) | `0xC66AB83418C20A65C3f8e83B3d11c8C3a6097b6F` (bloque 313) |
| Faucet nuevo (fondeado 300 ETH) | `0x1f53E116c31F171e59f45f0752AEc5d1F5aA3714` (dispensa 30 ETH / 24 h) |
| Registro | `packages/shared/deployments/31337.json` re-sincronizado (`abiHash 0x179d08e3…`) |

Verificado on-chain: **7 roles** en el owner (incluye `ROYALTY_ADMIN`), `royaltyBpsOf` = 500/500/1000,
`ROYALTY_BPS_MAX` = 2000, `isRoomRegistered(101)` = false (sin siembra).

**Imágenes y revisiones**

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| web | `web:v56` | ✅ SUCCESS `cb3d3b75` (3m50s) | `hotel-mcp-web-00109-tiv` | **100 %** |
| mcp | `mcp:v56` | ✅ SUCCESS `d4ce726c` (2m32s) | `hotel-mcp-mcp-00018-7pc` | **100 %** |
| worker | `worker:v52` (sin cambios) | vigente | — | 100 % |

Construidas desde un **worktree limpio** en `649251e` (el árbol de trabajo tenía el WIP de vNext).

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario `/`, `/catalogo`, `/asistente`, `/admin`, `/health/ready` | **200** y `READY` (`postgres/redis/polygonRPC` UP) |
| El bundle servido trae el código y la dirección nuevos | `/_next/static/chunks/7362-…js` contiene `setRoyaltyBps` y `0x532802f2…` ✅ |
| Catálogo **vacío** por la ausencia de siembra | «Sin noches» en `/catalogo`; el asistente responde «No hay habitaciones disponibles en este momento» ✅ |
| MCP v56 | `/health` OK (leyendo la cadena, bloque 546) |
| Consola de royalty | `/admin/royalty` pasa a mostrar el formulario (antes aviso de contrato D-06) |

**Consecuencia declarada.** Sin sembrar, **no hay noches a la venta** en producción: la compra y el
asistente no pueden ofrecer nada hasta que se ejecute la siembra (registro de habitaciones + minteo).
La versión C1 es **irreversible por dirección**: para volver al comportamiento anterior basta promover
las revisiones v55/v54 (la web/mcp antiguas seguían apuntando al contrato D-06).

**Rollback**

```bash
# apps → revisión anterior (contrato D-06, catálogo con las noches que hubiera)
gcloud run services update-traffic hotel-mcp-web --region=europe-west1 --to-revisions=hotel-mcp-web-00107-xoh=100
gcloud run services update-traffic hotel-mcp-mcp --region=europe-west1 --to-revisions=hotel-mcp-mcp-00017-728=100
# (si se volviera a construir sobre el contrato antiguo, re-sincronizar el registro a 0xC66AB…)
```

---

## 79. Release v57 — el proyecto pasa de Anvil a **Besu** (2026-10-13)

**Qué se desplegó.** La adaptación de red completa: la plataforma deja de usar el **Anvil global**
(`chainId 31337`, proyecto `mcc-ecommerce`) y pasa a la **red de prueba Besu de Codecrypto**
(`chainId 81234`, `https://besu.alumnos.codecrypto.academy`). Anvil queda **solo como espejo local de
desarrollo/CI** con el mismo `chainId`; el código elige la red por la **URL del RPC** (localhost ⇒
Anvil), de modo que no hay lógica cableada a una red concreta.

**Código y configuración** (commit `7e17f94`; monitor `4c77786`)

- `packages/shared`: `BESU_RPC_URL` apunta al nodo vigente (`besu.alumnos.codecrypto.academy`) y
  `besuChain` ya no arrastra el RPC histórico del laboratorio.
- `apps/web/config/chain.ts`: un RPC remoto resuelve `besuChain` (antes exigía `NEXT_PUBLIC_NETWORK=besu`
  y, con `chainId 81234`, caía en `anvilChain`). `NEXT_PUBLIC_NETWORK=anvil` fuerza el modo dev.
- `infra/gcp`: `GCP_CHAIN_RPC_URL`/`GCP_CHAIN_ID` (Besu por defecto; `GCP_ANVIL_*` quedan como alias),
  `_NEXT_PUBLIC_NETWORK=besu` en el build, `--legacy --with-gas-price 1000` en el `cut` (Besu: `baseFee=0`,
  mínimo 1000 wei) y el monitor elige la cadena por la URL del RPC.

**Contrato (Besu 81234)**

| Elemento | Valor |
|---|---|
| `HotelNights` | `0x676F5F71DAE1C83Dc31775E4c61212bC9e799d9C` (bloque 5.496.805) |
| `HotelOperations` (vNext F2) | `0x222d74f33b0d07687a769a44399e2272a4cb9ffe` |
| Registro | `packages/shared/deployments/81234.json` |
| Faucet | **el de Codecrypto** (no se despliega el del proyecto en Besu, decisión C9) |

**Imágenes y revisiones**

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| web | `web:v57` | ✅ `899b4122` (4m02s) | `hotel-mcp-web-00111-kaf` | **100 %** |
| mcp | `mcp:v57` | ✅ `56eb63ca` (2m45s) | `hotel-mcp-mcp-00019-4cs` | **100 %** |
| worker | `worker:v57` | ✅ `9548c9e8` (2m18s) | `hotel-mcp-worker-00019-tm4` | 100 % |
| monitor | `monitor:v58` | ✅ `e24248fd` (2m37s) | pool `hotel-mcp-monitor` | — |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Rutas de producción y `/health/ready` | `/`, `/catalogo`, `/asistente`, `/admin`, `/health/ready` → **200** y **READY** |
| El bundle servido apunta a Besu | contiene `besu.alumnos.codecrypto.academy`, el contrato `0x676f…d9C` y `chainId 81234` ✅ |
| MCP conectado a Besu | `/health` → `block 5.499.846` (Besu, no los ~550 bloques del Anvil global) ✅ |
| Worker indexando Besu | `/health` → `lastBlock=headBlock=5.499.844`, `lag 0`; `/aggregates` con contadores a **0** (reset por cambio de dirección, MAJOR#3) ✅ |
| Monitor | pool con `CHAIN_RPC_URL=https://besu.alumnos.codecrypto.academy`, `CHAIN_ID=81234`; imagen `monitor:v58` ✅ |
| Catálogo | **vacío** («Sin noches») y el asistente responde que no hay disponibilidad: Besu **no tiene siembra** ✅ |

**Estados conocidos.** El worker reporta `emailDegraded: true` (y por tanto `COMPONENT_DOWN`) porque el
despliegue configura `SMTP_HOST=smtp.invalid`: es el **stub de correo de siempre**, previo a esta release
y ajeno al cambio de red. El catálogo está vacío hasta que se registren habitaciones y se minteen noches
en Besu.

**Rollback** (volver a Anvil 31337 / contrato D-06, revisiones de la release v56)

```bash
gcloud run services update-traffic hotel-mcp-web  --region=europe-west1 --to-revisions=hotel-mcp-web-00109-tiv=100
gcloud run services update-traffic hotel-mcp-mcp  --region=europe-west1 --to-revisions=hotel-mcp-mcp-00018-7pc=100
gcloud run services update-traffic hotel-mcp-worker --region=europe-west1 --to-revisions=hotel-mcp-worker-00018-n64=100
# y el monitor: bash infra/gcp/deploy-monitor.sh …/monitor:v14 con CHAIN_RPC_URL/CHAIN_ID del Anvil
```

---

## 80. Release v59 — frontend reconstruido desde `main` (2026-10-15)

**Qué se desplegó.** La web se recompiló y desplegó desde el commit **exacto** que se subió a `main`
(`45669c9`, push a los tres remotos), para que la imagen en ejecución corresponda al código publicado
(adaptación a Besu + corrección del reset). Sin cambios funcionales en la web: entre `7e17f94` (base de
`web:v57`) y `45669c9` solo cambiaron el monitor y el script de reset.

| Elemento | Valor |
|---|---|
| Imagen | **`web:v59`** (build `ad0c87e0`, 4m51s, SUCCESS) |
| Revisión | **`hotel-mcp-web-00113-yuh`** · tráfico **100 %** |
| Origen | worktree limpio en `45669c9` (registro `81234.json` → contrato Besu `0x676F…d9C`, bloque 5.496.805) |
| Push | `origin`, `github` y `codecrypto`: `main` y `Hotel-DSH-GCP-v3` → `45669c9` |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Canario y producción: `/`, `/catalogo`, `/asistente`, `/admin`, `/health/ready` | **200** y **READY** (postgres/redis/RPC UP) |
| Bundle servido | contiene `besu.alumnos.codecrypto.academy`, `0x676f…d9C` y «Codecrypto Besu»; **`mcc-foundry-anvil` ausente** ✅ |
| Catálogo | «Sin noches» (cadena Besu y BD off-chain sin habitaciones tras el reset) |
| Worker / MCP | agregados a 0; MCP en el bloque de Besu (5.545.664) |

**Rollback:** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00111-kaf=100` (release v57, mismo contenido funcional).

---

## 81. Release v60 — UI de subastas (C2 · RF-13) en producción

**Qué se desplegó.** La web con la **vista pública `/subastas`** y el **panel del hotel
`/admin/subastas`** (ciclo C2), más el arreglo del lector on-chain. El contrato `NightAuction` todavía
**no** está desplegado en la red: el build sale sin `NEXT_PUBLIC_AUCTION_ADDRESS`, así que `/subastas`
muestra su estado honesto («Las subastas no están desplegadas en este entorno») en vez de apuntar a un
contrato inexistente. La activación real llega con la **ventana de redeploy** (ADR-28: `HotelNights`
con el gancho + `NightAuction`).

| Elemento | Valor |
|---|---|
| Imagen | **`web:v60`** (build `6513b0b1`, 3m50s, SUCCESS) |
| Revisión | **`hotel-mcp-web-00115-gev`** · tráfico **100 %** |
| Origen | worktree limpio en `4bbb9f9` |
| Build | `f8-build-images.sh` lee ahora `deployments/<chain>-auction.json` (lo escribirá `DeployAuction.s.sol`) y lo inyecta como `NEXT_PUBLIC_AUCTION_ADDRESS`/`_DEPLOYMENT_BLOCK`; si no existe, la web arranca sin subasta |

**Verificación (canario y producción)**

| Comprobación | Resultado |
|---|---|
| Rutas `/`, `/catalogo`, `/subastas`, `/asistente`, `/health/ready` | **200** y `READY` |
| `/subastas` sin subasta desplegada | renderiza `data-testid="auctions-not-configured"` (estado honesto) |
| Cabecera pública | enlace **«Subastas»** presente en el HTML |
| `/admin/subastas` sin sesión | **no** se renderiza el panel (0 `data-testid` de la subasta); el texto que aparece en el HTML es el payload serializado de i18n |
| Catálogo | «Sin noches» (sin siembra) |
| `next build` local | **OK**, 106 páginas, con `/subastas` y `/admin/subastas` en la tabla de rutas |

**Pendiente declarado:** la ventana de redeploy (`HotelNights` + `NightAuction`, RUNBOOK §1.5.3) es lo
que activa la subasta de punta a punta; hasta entonces la página queda en su estado «no configurada».

**Rollback:** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00113-yuh=100` (release v59).

---

## 82. Ventana de C2 en Besu — subasta operativa (2026-10-17)

**Decisión del responsable:** red **Besu 81234** + **una suite sembrada** para que la subasta sea
demostrable. La producción ya corría sobre Besu (release v57), así que la ventana fue: contratos
nuevos en Besu + apuntar la app al contrato nuevo + recompilar.

### Contratos (Besu 81234)

| Contrato | Dirección | Bloque | Nota |
|---|---|---|---|
| `HotelNights` **(C2)** | **`0xF8b1d4d0A2Dd9Dd53200A4C6783a69c15E3a25F4`** | `5655376` | con el gancho `AUCTION_ROLE`/`settleAuction`; 7 roles verificados para el owner |
| `NightAuction` **(C2)** | **`0x934A389CaBFB84cdB3f0260B2a4FD575b8B345A3`** | `5655388` | `AUCTION_ROLE` **al contrato**, no al owner; `hotel()` apunta al contrato nuevo |
| Rollback `HotelNights` | `0x676F5F71DAE1C83Dc31775E4c61212bC9e799d9C` | `5496805` | C1 (sin gancho) |

`HotelOperations` (`0x222d74f3…`) no cambia: C2 no toca su interfaz.

### Siembra (mínima, para la demo)

- Habitación **201 (`suite`)** registrada en el contrato nuevo.
- Noche **`20120261115`** (2026-11-15, 0,2 CC) minteada al hotel (treasury).
- **Subasta abierta**: reserva **0,1 CC**, duración 7 días, puja inicial de **0,12 CC** de la cuenta 1
  ⇒ `/subastas` la muestra «Abierta» con mínima siguiente **0,126 CC** (0,12 + 5 %).

### Aplicación (Cloud Run)

| Servicio | Revisión | Imagen |
|---|---|---|
| web | **`hotel-mcp-web-00118-neb`** (100 %) | **`web:v62`** (`NEXT_PUBLIC_CONTRACT_ADDRESS=0xf8b1d4…`, `NEXT_PUBLIC_AUCTION_ADDRESS=0x934A…`) |
| mcp | `hotel-mcp-mcp-00020-6rn` | `mcp:v61` |
| worker | `hotel-mcp-worker-00020-qpr` | `worker:v57` (imagen sin cambios; **env** al contrato nuevo; agregados reseteados, `mintedCount=1`) |

### Verificación

| Comprobación | Resultado |
|---|---|
| Aceptación Besu (`measure-besu.mjs`, `EXPECTED_MINTS=1`) | **PASS** — bloques P50 2 s/P95 2 s, RPC P95 12,1 ms, 1/1 mints indexables |
| `/subastas` (canario y producción) | `auctions-live`: «Noche 201», «Abierta», reserva 0,1, puja 0,12, **mínima 0,126**, cuenta atrás |
| `/catalogo` | ya **no** ofrece la noche subastada (filtro `excludeAuctionedNights`, commit `5a5265a`) |
| Rutas `/`, `/catalogo`, `/subastas`, `/health/ready` | 200 |
| Worker | lag 0, `aggregateLag` 0, `mintedCount=1` |
| Rollback web | `hotel-mcp-web-00115-gev` (v60) |

### Incidencias de la ventana

1. **Timeout transitorio del RPC de Besu** durante el sembrado: `registerRoom` y `mint` quedaron
   minadas; `createAuction` se reenvió.
2. **`createAuction` revertía `InvalidStartTime`** al calcular el inicio con el `timestamp` del bloque
   anterior (quedaba en el pasado al minarse): se simula con `eth_call` y se usa `start = now + margen`.
3. **Cloud Build rechazaba las sustituciones de la subasta** (`INVALID_ARGUMENT`): faltaban en
   `infra/docker/cloudbuild.yaml` y `Dockerfile` → corregido en `6f356f3`.

### Deuda declarada (próxima ventana de contrato)

`HotelNights.buy()` sigue permitiendo comprar en primaria una noche en subasta (el contrato de noches
no conoce el estado de la subasta). **Mitigado** en la app (el catálogo excluye las noches con
subasta viva); el arreglo on-chain (flag `_auctioned` por `AUCTION_ROLE` o escrow) queda para la
próxima ventana. Detalle en [ADR-28](docs/adr/ADR-28-subastas-on-chain-con-pull-payments.md).

---

## 83. Release v63 — alineación completa con el commit publicado (`6e38fe5`)

**Motivo.** Cerrar la entrega de C2 con las **tres imágenes reconstruidas desde el commit exacto
publicado** en la rama `Hotel-DSH-GCP-v3` (`6e38fe5`), para que lo que corre en Cloud Run sea
reproducible desde el repositorio (hasta ahora el worker seguía en `v57` y la web en `v62`,
construida desde un worktree).

| Servicio | Revisión | Imagen |
|---|---|---|
| web | **`hotel-mcp-web-00120-nag`** (100 %) | **`web:v63`** |
| mcp | **`hotel-mcp-mcp-00021-v64`** | **`mcp:v63`** |
| worker | **`hotel-mcp-worker-00021-cwq`** | **`worker:v63`** |

Builds: `web` 3m57s · `worker` 2m19s · `mcp` 2m23s (Cloud Build, SUCCESS), desde un worktree limpio en
`6e38fe5` con el registro de Besu (`0xf8b1d4…`) y la subasta (`0x934A…`) copiados.

**Verificación del canario y de producción**

| Comprobación | Resultado |
|---|---|
| Rutas `/`, `/catalogo`, `/subastas`, `/asistente`, `/health/ready` | **200** |
| `/subastas` | `auctions-live`: «Noche 201», «Abierta», 0,12 y mínima **0,126** |
| `/catalogo` | sin la noche subastada (filtro C2) |
| worker | `mintedCount=1`, `lag=0` |
| Rollback | `hotel-mcp-web-00118-neb` (v62) / `00020-qpr` (worker) / `00020-6rn` (mcp) |

**Estado**: repo publicado en `6e38fe5` (rama de trabajo, `main` intacto en `9c5ed07`) y producción
sirviendo exactamente ese commit.

---

## 84. Activación de WalletConnect v2 en producción (C0 · RF-11 · `web:v64`)

**Qué se hizo.** El responsable aportó el `projectId` de WalletConnect Cloud y se construyó la web con
la variable de build `WALLETCONNECT_PROJECT_ID` (ADR-29, RUNBOOK §2.0), de modo que el conector
`walletConnect` de wagmi pasa a registrarse junto a las billeteras inyectadas (EIP-6963) y Coinbase.

| Elemento | Valor |
|---|---|
| Imagen | **`web:v64`** (build `687e27e2`, 3m39s, SUCCESS) |
| Revisión | **`hotel-mcp-web-00122-lal`** · tráfico **100 %** |
| Build-arg verificado | el log de Cloud Build muestra `--build-arg=NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=de05…` |
| Rollback | `hotel-mcp-web-00120-nag` (v63, sin WalletConnect) |

**Verificación** (canario y producción):

| Comprobación | Resultado |
|---|---|
| Rutas `/`, `/reservar`, `/catalogo`, `/subastas`, `/health/ready` | **200** |
| `projectId` inlined en el bundle servido | **sí** — 2 chunks del canario (`7362-*.js` y `app/layout-*.js`) y el chunk de layout en producción |
| Conector `walletConnect` en el bundle | **sí** |
| Sin regresiones | la subasta sigue viva y el catálogo sigue excluyendo la noche subastada |

**Pendiente de verificación manual (necesita un móvil):** abrir el selector de cartera, comprobar que
aparece **WalletConnect** y que el modal pinta el **QR**; emparejar con MetaMask móvil, añadir la red
**81234** y firmar (TC-ACC-003). El relay de WalletConnect es un tercero: si no responde, las
billeteras inyectadas siguen funcionando.

---

## 85. Release v65 — mensajes de firma legibles en la wallet (ADR-30)

**Qué se desplegó.** Los mensajes que la wallet enseña al firmar ya son los del diseño ADR-30:
resguardo y reseña con **motivo, habitación y noche** (EIP-712 v2) y publicación de ficha con un
**texto legible** (huella + hora UTC + dominio) en vez de un `0x…` suelto. Sin cambios on-chain.

| Elemento | Valor |
|---|---|
| Imagen | **`web:v65`** (build `5262baf4`, 3m37s, SUCCESS, con `WALLETCONNECT_PROJECT_ID`) |
| Revisión | **`hotel-mcp-web-00124-gav`** · tráfico **100 %** |
| Origen | worktree limpio en `324c2b2` (incluye el fix de los barriles de `shared`) |
| Rollback | `hotel-mcp-web-00122-lal` (v64, mensajes v1) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| Rutas `/`, `/mis-noches`, `/catalogo`, `/subastas`, `/health/ready` | **200** |
| Bundle servido | contiene «Descargar el resguardo de mi noche», `TicketAuthorization` y `ReviewAuthorization` (chunk `7362-*`) |
| WalletConnect | `projectId` sigue inlined en el layout (no se perdió en el rebuild) |
| Round-trip de firma | pruebas de `pass`, `qr`, `publish` y `rooms` en verde con las estructuras v2 (cliente firma ↔ servidor verifica) |
| Sin regresiones | subasta viva y catálogo sin la noche subastada |

**Incidencia de la release:** el primer build de `v65` falló porque el commit `9cfe7a1` había versionado
exports de vNext cuyos ficheros no están versionados. Corregido en `324c2b2` (los barriles versionados
solo exportan módulos versionados; el WIP de vNext sigue intacto en el árbol de trabajo).

**Pendiente de aceptación manual (TC-ACC-004):** abrir la wallet en MetaMask desktop y en móvil por
WalletConnect y comprobar que el mensaje del resguardo/reseña dice «Descargar el resguardo de mi
noche» / «Publicar mi reseña de la noche» con habitación y noche. Las operaciones vNext conservan la
firma opaca hasta la próxima ventana de contrato (ADR-30).

---

## 86. Inventario del despliegue vigente — cuentas, contratos y usuarios (2026-10-18)

> **Sección saneada: NO contiene secretos.** Es la foto del estado vigente y **sustituye como
> referencia** a las tablas de §1–§11 (que describen el despliegue original sobre el Anvil global
> `31337` y se conservan como histórico). El inventario **completo con contraseñas, semillas TOTP y
> claves privadas** está en `~/.config/hotel-mcp/DESPLIEGUE-GCP.md` (permisos `600`, fuera del
> repositorio; aquí solo se indica **dónde** vive cada credencial). Verificado en vivo el
> 2026-10-18 contra GCP y la red Besu.

### 86.1. Red y contratos

| Dato | Valor |
|---|---|
| Red | **Besu de Codecrypto** (testnet) · `chainId` **81234** (`0x13D52`) · moneda **CC** (18 dec.) |
| RPC | `https://besu.alumnos.codecrypto.academy` · `getLogs` máx. 5.000 bloques |
| Gas | `eth_gasPrice` = 1.000 wei · `baseFeePerGas` = 0 ⇒ tx **legacy** `--with-gas-price 1000` |
| `HotelNights` **(C2, vigente)** | **`0xF8b1d4d0A2Dd9Dd53200A4C6783a69c15E3a25F4`** · bloque real `5655378` (2026-10-17 14:18:23 UTC) · tx `0x6c1fa694…9d0592` |
| `NightAuction` **(C2, vigente)** | **`0x934A389CaBFB84cdB3f0260B2a4FD575b8B345A3`** · bloque real `5655390` (2026-10-17 14:18:43 UTC) · tx `0x3e68c9db…a3ce2f86` |
| `HotelOperations` (vNext F2) | `0x222d74f33b0d07687a769a44399e2272a4cb9ffe` · bloque real `5491513` (2026-10-13) |
| Rollback `HotelNights` (C1) | `0x676F5F71DAE1C83Dc31775E4c61212bC9e799d9C` · bloque `5496805` |
| Faucet | **no desplegado en Besu** (decisión C9: se usa el de Codecrypto) |
| Registros | `packages/shared/deployments/81234.json` y `packages/contracts/deployments/81234-{auction,operations}.json` (git-ignored; se copian a la imagen) |

> Los `deployments/latest*.json` guardan el `block.number` previo al broadcast (2–8 bloques por
> debajo del real). Los servicios usan `DEPLOYMENT_BLOCK=5655378` y la subasta `5655388`.

**Roles on-chain (verificados por RPC, 2026-10-19):** la **cuenta 0** conserva los 7 roles
(`DEFAULT_ADMIN`, `MINTER`, `BURNER`, `TREASURER`, `RECEPTION`, `PAUSER`, `ROYALTY_ADMIN`) y es
`treasury()`; `AUCTION_ROLE` lo tiene el **contrato `NightAuction`** (no el owner). Desde 2026-10-19
las hot-wallets tienen además su rol dedicado (aditivo): **cuenta 1 `MINTER`**, **cuenta 2 `BURNER`**
y **cuenta 3 `RECEPTION`**.

### 86.2. Servicios y revisiones vigentes

| Servicio | Revisión (tráfico) | Imagen | URL |
|---|---|---|---|
| web | **`hotel-mcp-web-00077-xm6`** (100 %) | **`web:v71`** | https://hotel-mcp-web-475955050238.europe-west1.run.app |
| mcp | **`hotel-mcp-mcp-00021-v64`** (100 %) | **`mcp:v63`** | https://hotel-mcp-mcp-475955050238.europe-west1.run.app |
| worker | **`hotel-mcp-worker-00024-q2h`** (100 %) | **`worker:v66`** | https://hotel-mcp-worker-475955050238.europe-west1.run.app |
| monitor | worker pool `hotel-mcp-monitor` | `monitor:v66` | — (sondea `/health`) |
| pgAdmin | `hotel-pgadmin-00004-jjf` (100 %) | `dpage/pgadmin4:latest` | https://hotel-pgadmin-d6jlzeq5yq-ew.a.run.app |

- Jobs: **`hotel-mcp-reconcile-rooms`** (imagen `worker:v66`, red privada + Cloud SQL: audita
  `rooms`↔cadena, siembra el maestro que falte y purga del índice lo que no exista en la cadena
  vigente; modo seco por defecto, `--apply` para ejecutar; ver §88) y `hotel-mcp-reset-all`
  (actualizado a C2: `CONTRACT_ADDRESS=0xF8b1…25F4`, `DEPLOYMENT_BLOCK=5655378`). El antiguo
  `hotel-mcp-inject-data` (Anvil 31337) **se retiró** el 2026-10-19.
- Servicios globales: Cloud SQL `hotel-mcp-pg` (PostgreSQL 18, IP privada `10.104.0.3`, base
  `hotel_nft`, usuario `hotel_admin`), VM Redis `hotel-mcp-redis` (`10.10.0.10:6379`),
  VPC `hotel-mcp-vpc`/`hotel-mcp-euw1` + NAT `hotel-mcp-router`.

### 86.3. Cuentas desplegadas (cadena)

Cuentas **deterministas de Anvil/Hardhat** (claves públicas conocidas; **no son secretos reales**).
Saldos/nonces el 2026-10-18.

| # | Dirección | Roles en C2 | Uso |
|---|---|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | los 7 + `treasury()` | desplegador, **cartera operadora del panel**, tesorería |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `MINTER` (desde 2026-10-19) | hot-wallet de acuñación; pujador actual de la subasta |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `BURNER` (desde 2026-10-19) | hot-wallet de quema; comprador de la noche de demo |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `RECEPTION` (desde 2026-10-19) | hot-wallet de recepción |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | — | cuenta del **relayer** (financiada con 5 CC; sin roles en `HotelOperations` por diseño) |
| 5–8 | `0x9965…A4dc`, `0x976E…0aa9`, `0x14dC…9955`, `0x2361…1E8f` | — | huéspedes simulados (0 CC) |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | — | huésped/pujador de pruebas (100 CC) |

- **Dónde viven las claves**: en `.env` (`DEPLOYER_`, `MINTER_RELAYER_`, `BURNER_WALLET_`,
  `RECEPTION_WALLET_`) y en Secret Manager (`hotel-burner-private-key`,
  `hotel-reception-private-key`, `hotel-relayer-private-key`). El inventario completo está en
  `~/.config/hotel-mcp/DESPLIEGUE-GCP.md` §3.
- **Consecuencia práctica**: la cuenta 0 sigue siendo la cartera con la que firma el panel; desde el
  2026-10-19 las hot-wallets 1–3 ya tienen su rol dedicado para mint/quema/check-in sin depender del
  owner (el mínimo privilegio estricto —retirar roles de la cuenta 0— exige relayer o ventana de
  contrato y sigue pendiente).

### 86.4. Usuarios de la plataforma (off-chain, `admin_users`)

| Usuario | Rol | Estado | Cartera documentada |
|---|---|---|---|
| `admin@hotel.es` | `DEFAULT_ADMIN_ROLE` (owner) | **activo** (creado 2026-09-25) | cuenta 0 |
| `recepcion@hotel.es` | `RECEPTION_ROLE` | **activo** (creado 2026-09-25) | cuenta 0 en C2 (la cuenta 1 ya no tiene el rol) |

- Solo existen **2 operadores**; no hay cuentas de housekeeping ni mantenimiento. La baja es
  `active=false`.
- El acceso es **contraseña + TOTP obligatorio** (`POST /api/auth/login` →
  `POST /api/auth/mfa/verify`, 10 min de reto y cookies HttpOnly; 5 intentos / 15 min de bloqueo).
- **Dónde viven las credenciales**: contraseñas, semillas TOTP, URIs `otpauth://`, códigos de
  rescate y QR en `~/.config/hotel-mcp/` (`inject-data-output.txt`, `totp-admin.png`,
  `totp-recepcion.png`) y en el inventario confidencial §4. **No se versionan.**
- Verificación del 2026-10-18: login + MFA de ambos operadores **200**, y `/api/admin/system/users`
  (como owner) devuelve los 2 operadores activos sin hashes; como recepción devuelve **403**.
- No hay usuario de BD por operador: la autenticación es de aplicación sobre `admin_users`.

### 86.5. Credenciales de infraestructura: dónde viven (no sus valores)

| Qué | Dónde |
|---|---|
| URL y contraseña de Cloud SQL | Secret Manager `hotel-database-url` / `hotel-db-password`; copia local `~/.config/hotel-mcp/db-password` |
| URL y contraseña de Redis | Secret Manager `hotel-redis-url`; copia local `~/.config/hotel-mcp/redis-password` |
| Secretos de aplicación | Secret Manager: `hotel-session-secret`, `hotel-jwt-secret`, `hotel-ticket-signing-secret`, `hotel-checkin-secret-key`, `hotel-aes-secret-key`, `hotel-mcp-shared-secret`, `hotel-vapid-private-key` |
| Claves on-chain | `.env` + Secret Manager `hotel-burner-private-key`, `hotel-reception-private-key`, `hotel-relayer-private-key` |
| pgAdmin | `PGADMIN_PASSWORD` (Secret Manager); email `anlucorporations@gmail.com` (env del servicio) |
| Inventario completo en claro | `~/.config/hotel-mcp/DESPLIEGUE-GCP.md` (permisos `600`, fuera de git) |
| WalletConnect | projectId de build inyectado en la imagen `web:v71` |

### 86.6. Estado de los datos de prueba

| Elemento | Estado |
|---|---|
| Noches en el contrato C2 | **2**: `20120261115` (habitación 201, `SUITE`, 0,2 CC, en subasta) y `20120261116` (habitación 201, 0,2 CC, **vendida** y con check-in anclado) |
| Room master on-chain | habitación **201** (registrada); en BD, la 201 está **`PUBLISHED`** (publicada el 2026-10-19 con firma TOTP; anclaje on-chain pendiente) |
| Habitaciones en BD (`/api/admin/rooms`) | **50**, 49 `DRAFT` + 201 `PUBLISHED`: 15 `SIMPLE` (101–115), 15 `DOBLE` (116–130), 20 `SUITE` (201–220) — sembradas del maestro canónico el 2026-10-18 (§88) |
| Índice off-chain `/api/nfts` | **2** noches reales de C2: `20120261115` (`AVAILABLE`, subasta) y `20120261116` (`CHECKED_IN`) — reindexado el 2026-10-19 (§89) |
| Catálogo `/catalogo` | **vacío y honesto**: «Sin noches» (la subastada se excluye y la vendida ya no es oferta primaria) |
| Reservas de hoy | 0 |
| Métricas | `mintedCount=2`, `soldCount=1` |
| **Subasta viva** | noche `20120261115` · reserva 0,1 CC · puja actual 0,12 CC (cuenta 1) · **mínima 0,126 CC** · `OPEN` · cierra **2026-10-24 14:21:47 UTC** · `settle` permissionless tras el cierre |
| **Quema** | `burn.scheduler=enabled` (cuenta 2 con `BURNER_ROLE`; diaria a las 12:00 Europe/Madrid) |
| **Anclaje** | `anchor.scheduler=enabled` (relayer cuenta 4; último ciclo sin pendientes) |
| Salud | web **READY**; mcp **ok**; worker con `lag=0`/`aggregateLag=0` (el 503 es solo por `emailDegraded` con `SMTP_HOST=smtp.invalid`) |

### 86.7. Limitaciones conocidas (leer antes de probar)

1. **Compra y check-in ya demostrados en C2** (§89): noche `20120261116` minteada, comprada por la
   cuenta 2 y con check-in anclado. Para una demo de catálogo pública sigue haciendo falta que el
   resto de habitaciones se publique y se acuñe su ventana (solo la 201 está `PUBLISHED`).
2. **Catálogo restringido al maestro administrado**: solo se ofertan noches de habitaciones
   `PUBLISHED`, vigentes y sin avería. Las otras 49 están en `DRAFT` a propósito (D-14). **Resuelto
   el desfase C1→C2 del 2026-10-18**: el índice heredado se purgó y el catálogo verifica además la
   existencia del token en la cadena.
3. **Roles**: desde el 2026-10-19 las hot-wallets 1–3 tienen su rol dedicado, pero la cuenta 0
   conserva los 7 (mínimo privilegio estricto pendiente de relayer o ventana de contrato).
4. **Sin relayer en la web**: la web no tiene `RELAYER_WALLET_PRIVATE_KEY`; firma siempre la cartera
   conectada. El anclaje de operaciones sí usa el relayer del worker (F3).
5. **Quema automática activada** el 2026-10-19 (diaria 12:00 Europe/Madrid, cuenta 2); sin noches
   caducadas pendientes hoy.
6. **Emails no operativos** (SMTP `smtp.invalid`, **pendiente de credenciales reales**);
   `/api/admin/system/operations` responde **503** y el worker figura `down` por `emailDegraded`.
7. **Deuda on-chain**: `buy()` sigue permitiendo comprar una noche en subasta (mitigado solo en el
   catálogo; ADR-28).
8. **Nodo Besu**: timeouts intermitentes; `getLogs` máx. 5.000; `eth_estimateGas` revierte
   `PastDate` en `mint()` ⇒ `--gas-limit` explícito.
9. **Faucet**: el de Codecrypto (externo, no hay URL documentada en el repo); la web se despliega
   con `NEXT_PUBLIC_FAUCET_ADDRESS` vacío.
10. **Jobs**: `inject-data` retirado; `reset-all` actualizado a C2; `reconcile-rooms` operativo (§88).

### 86.8. Verificación realizada (2026-10-18 y 2026-10-19)

| Comprobación | Resultado |
|---|---|
| `/health/ready` web · `/health` mcp · `/health` worker | **200 READY** · **200 ok** · **503** `down` solo por email, `lag=0` |
| Login + TOTP de `admin@hotel.es` y `recepcion@hotel.es` | **200/200** ambos, sesiones `DEFAULT_ADMIN_ROLE` y `RECEPTION_ROLE` |
| `/api/admin/system/users` (owner / recepción) | **200** (2 operadores) / **403** |
| `cast chain-id` · roles · `auctionOf` · `nextMinBid` | 81234 · 7 roles en cuenta 0 + MINTER/BURNER/RECEPTION en 1/2/3 · reserva 0,1/puja 0,12 · mínima **0,126** |
| `/subastas` · `/catalogo` · `/api/nfts` · `/api/admin/metrics` | subasta viva · **catálogo vacío honesto** · **2 registros** (`20120261115` AVAILABLE, `20120261116` CHECKED_IN) · `mintedCount=2`/`soldCount=1` |
| `/api/public/rooms` | **1** reservable (habitación 201 `PUBLISHED`; las otras 49 siguen `DRAFT`) |
| `/api/admin/rooms` (owner, MFA) | **50** habitaciones administradas: 15 `SIMPLE`, 15 `DOBLE`, 20 `SUITE` |
| `hotel-mcp-reconcile-rooms` (modo seco) | `pendingSeedRooms=[]`, `stale=[]`, `roomIssues=[]` (ver §88) |
| Compra + check-in de demo (§89) | mint `0x5f95bb57…` · compra `0x17fcc9e6…` · check-in `0x68185e7d…` · estados `SOLD`→`CHECKED_IN` |
| Anclaje F3 (smoke, §87) | tx `0x1856106c…` · bloque 5715738 · `OperationalAction` con firmante owner |
| pgAdmin | **200** en `/login` (login no automatizado; credenciales fuera de git) |

### 86.9. Rollback

| Servicio | Actual | Rollback |
|---|---|---|
| web | `00073-9j5` (v66) | `00124-gav` (v65) → `00122-lal` (v64) |
| mcp | `00021-v64` (v63) | `00020-6rn` (v61) |
| worker | `00024-q2h` (v66, anclaje + quema) | `00023-w9c` (v66, anclaje) → `00022-pv9` (v66, F3) → `00021-cwq` (v63) |

```bash
gcloud run services update-traffic hotel-mcp-web --region=europe-west1 --to-revisions=hotel-mcp-web-00124-gav=100
gcloud run services update-traffic hotel-mcp-mcp --region=europe-west1 --to-revisions=hotel-mcp-mcp-00020-6rn=100
gcloud run services update-traffic hotel-mcp-worker --region=europe-west1 --to-revisions=hotel-mcp-worker-00023-w9c=100
```

> Los datos no se revierten con la imagen: el estado posterior a §88 es el correcto. El backup previo
> completo está en `gs://hotel-mcp-backups/pre-catalog-cleanup-20261018.sql`.

### 86.10. Referencias

- Credenciales completas (CONFIDENCIAL, fuera de git): `~/.config/hotel-mcp/DESPLIEGUE-GCP.md`.
- Inventario de sistema saneado (**histórico, cadena Anvil 31337**): [`BaseOperaciones/inventario_sistema.md`](./BaseOperaciones/inventario_sistema.md).
- Red Besu: [`entornos_globales.md`](./entornos_globales.md) §2.bis; runbook: [`RUNBOOK.md`](../docs/RUNBOOK.md).
- Subasta: [ADR-28](../docs/adr/ADR-28-subastas-on-chain-con-pull-payments.md); mensajes de firma:
  [ADR-30](../docs/adr/ADR-30-mensajes-firmados-legibles-en-la-wallet.md).
- Evidencias: `RepoTecnico/evidencias/aceptacion-besu-81234-2026-10-13.json`,
  `RepoTecnico/evidencias/c2-redeploy-besu-81234-2026-10-17.json` y
  `RepoTecnico/evidencias/c3-catalogo-habitaciones-2026-10-18.json`.

---

## 87. Release v66 — F3 desplegado: outbox de anclaje operativo en Besu (2026-10-18)

**Qué se desplegó.** El cierre de **F3** (outbox de anclaje + worker relayer) sobre la red Besu
81234, después de commitear y publicar el trabajo vNext F2/F3 y su documentación en la rama
`Hotel-DSH-GCP-v3` (commits `70e08f1`, `ce5e1bf`, `5382e45`, `8466297`, `fd6d33f`).

| Elemento | Valor |
|---|---|
| Imágenes | **`worker:v66`** (build `78d93cbd…`, 3m15s, SUCCESS) y **`monitor:v66`** (build `70603f40…`, 2m58s, SUCCESS), desde *worktree* limpio en `fd6d33f` |
| Worker | revisión **`hotel-mcp-worker-00022-pv9`** (100 %) |
| Monitor | worker pool `hotel-mcp-monitor` con `monitor:v66` (8 env/secretos conservados) |
| Config nueva | `HOTEL_OPERATIONS_CONTRACT_ADDRESS=0x222d74f3…b9ffe` · `HOTEL_OPERATIONS_DEPLOYMENT_BLOCK=5491505` · secreto `ANCHOR_RELAYER_PRIVATE_KEY` (`hotel-relayer-private-key`) |
| Relayer | cuenta 4 `0x15d34A…6A65`, **sin roles** en `HotelOperations`, financiada con 5 CC (tx `0xe8e5fe8d…f0bb`) |
| Rollback | `gcloud run services update-traffic hotel-mcp-worker --region=europe-west1 --to-revisions=hotel-mcp-worker-00021-cwq=100` (worker:v63, sin anclaje) y monitor `monitor:v58` |

**Verificación (anclaje real, no simulado)**

| Comprobación | Resultado |
|---|---|
| Job temporal que firma una acción `CONFIG` y la deja `SIGNED` | insertada en `on_chain_signatures` |
| Worker la reclama y la ancla | `outbox: firma anclada` · ciclo `{claimed:1, mined:1, failed:0}` |
| Transacción | `0x1856106c…75949af` · bloque **`5715738`** · `status: success` |
| Evento | `OperationalAction(CONFIG, payloadHash=0xbf7f…45e5, signer=owner)`; el gas lo pagó el relayer sin roles |
| `/health` | `anchor.scheduler="enabled"`; sin firmas pendientes |
| Evidencia | `RepoTecnico/evidencias/f3-deploy-produccion-2026-10-18.json` |

**Pendiente de este bloque (paso siguiente):** SMTP real (el worker sigue en 503 por
`emailDegraded`), reactivar la quema, decidir roles/mínimo privilegio y actualizar los jobs
obsoletos. El anclaje queda operativo a la espera de que F4 emita firmas desde la UI.

---

## 88. C3 — limpieza de la interfaz pública y reconciliación habitaciones on-chain/off-chain (2026-10-19)

**Encargo:** «limpia la interfaz pública para que el catálogo refleje la realidad de lo administrado;
verifica que lo on-chain y lo off-chain estén correctos en materia de habitaciones».

**Punto de partida (el defecto documentado en §86.7.2).** Tras el redeploy C2 el índice off-chain no
se había reseteado: `nfts` conservaba **98 filas de C1** (75 `AVAILABLE`), la base `rooms` estaba
**vacía** y el catálogo público ofrecía **68 noches** de la habitación 101 que **no existían** en
`0xF8b1…25F4`. El panel, mientras tanto, pintaba 50 habitaciones estáticas del maestro del código que
no eran filas administradas.

### Qué se hizo

| Paso | Detalle |
|---|---|
| **Backup** | Export SQL completo previo: `gs://hotel-mcp-backups/pre-catalog-cleanup-20261018.sql` |
| **Reconciliación** | Script nuevo `packages/shared/scripts/reconcile-rooms.ts` + job `hotel-mcp-reconcile-rooms` (imagen `worker:v66`, VPC + Cloud SQL). Modo seco por defecto; `--apply` ejecuta. Lógica pura en `@hotel/shared/domain` (`room-reconciliation.ts`) con 12 pruebas |
| **Maestro off-chain** | Sembradas las **50 habitaciones del maestro canónico** en `DRAFT` (D-14): 15 `SIMPLE` (101–115), 15 `DOBLE` (116–130), 20 `SUITE` (201–220), con tarifa base del maestro. Ahora `/api/admin/rooms` lista 50 filas reales |
| **Índice** | Purgadas las **97 filas heredadas de C1** que no existen en C2 (cascada a `listings`/`sale_events`; `worker_sale_history` explícito). Queda **1** fila: `20120261115`, la única noche real |
| **Código (web v66)** | El catálogo **intersecta el índice con el maestro administrado** (publicada + vigente + sin avería de mantenimiento, regla única en `@hotel/shared` `isRoomSellable`, compartida con `/api/public/rooms` y recepción) y **verifica la existencia del token** (`priceOf == 0` ⇒ fila heredada, se retira) antes de ofrecerlo. El fallback RPC usa la misma puerta. Mensaje de sincronización actualizado en es/en/ru |
| **Regla única** | `isRoomSellable`/`sellableRoomNumbers` acaban con las tres copias de la condición «PUBLISHED y no bloqueada» que había en el catálogo, la reserva pública y recepción |

### Verificación en producción (2026-10-18 23:55–00:10 UTC)

| Comprobación | Resultado |
|---|---|
| `/catalogo` | **200** · «Sin noches · Aún no hay noches publicadas» · **0 ofertas** (antes 68 fantasma) |
| `/api/nfts?status=AVAILABLE` | **1** registro (`20120261115`) · antes **98** |
| `/api/public/rooms` | **0** reservables (ninguna `PUBLISHED`; correcto) |
| `/api/admin/rooms` (owner + MFA) | **50** habitaciones `DRAFT` (15/15/20) |
| `/subastas` | sigue operativa: Noche 201 · Suite · 15 nov 2026 · Abierta · mejor puja 0,12 · mínima 0,126 |
| `/health/ready` | **READY** (postgres/redis/RPC UP) |
| Job de reconciliación, modo seco final | `db.rooms=50`, `db.nfts=1`, `pendingSeedRooms=[]`, `stale=[]`, `roomIssues=[]`, worker `contract_address=0xF8b1…`/`minted_count=1` |

**Coherencia habitaciones on-chain ↔ off-chain (auditada por el script):**

- La única habitación registrada on-chain (**201**, tipo `suite`) existe en `rooms` con tipo `SUITE`.
  Cero `MISSING_IN_DB`, cero `TYPE_MISMATCH`, cero `ARCHIVED_BUT_REGISTERED`.
- Ninguna habitación `PUBLISHED` queda sin registro on-chain (no hay publicadas todavía: el catálogo
  vacío es la consecuencia correcta, no un fallo).
- Toda fila del índice tiene token existente en el contrato vigente (1/1).
- Worker alineado con el contrato vigente (`contract_address`, `minted_count=1`, `sold_count=0`).

**Imagen y revisión:** `web:v66` → revisión **`hotel-mcp-web-00073-9j5`** (100 %). Rollback:
`hotel-mcp-web-00124-gav` (v65).

**Deuda declarada que sigue abierta:** el registro on-chain de la habitación 201 existe aunque la
fila esté `DRAFT` (se registró para la subasta de C2); no es incoherente para la auditoría (la regla
exige registro para lo publicado, no al revés), pero si se archiva habría que resolverlo en ventana
de contrato. Queda fuera de este ciclo: publicar habitaciones y acuñar ventanas (haría falta
`room_images` y la firma del owner) y actualizar los jobs obsoletos `inject-data`/`reset-all`.

**Evidencia:** `RepoTecnico/evidencias/c3-catalogo-habitaciones-2026-10-18.json`.

---

## 89. Compra y check-in demostrables en C2 + operación (2026-10-19)

**Qué se hizo.** Cierre del paso 3–4 del plan de puesta en producción: una **compra primaria real** y
su **check-in anclado** sobre Besu, más la activación de la quema, la asignación de roles a las
hot-wallets y la limpieza de jobs obsoletos.

### Demo de compra y check-in (producción, Besu 81234)

| Paso | Detalle |
|---|---|
| Habitación publicada | **201** (`SUITE`) → `PUBLISHED` vía `POST /api/admin/rooms/<id>/publish` con sesión owner + re-confirmación TOTP (huella `0x9abaa182…25f7`); se sembró su fila en `room_images` para cumplir D-20 |
| Noche acuñada | **`20120261116`** (2026-11-16, 0,2 CC) por la cuenta 0 (`MINTER`) · tx `0x5f95bb578de58f33ed635dbab45a4d01425a68fa72d02ad03893320bb27c3af5` · bloque 5716449 |
| Compra primaria | cuenta 2 `0x3C44…93BC` paga 0,2 CC · tx `0x17fcc9e66c1a1e3bb71e982d720278ac3bd32a02de23116b43bb4315cbe64a0b` · bloque 5716469 · `ownerOf` = cuenta 2 |
| Check-in anclado | cuenta 0 (`RECEPTION_ROLE`) · tx `0x68185e7dccbac572ad56a774c8be1d941156890db8d6ed6142d10624ed4c64ff` · bloque 5716613 · `isCheckedIn=true` |
| Estado final | `/api/nfts`: `20120261115` `AVAILABLE` (subasta) y `20120261116` **`CHECKED_IN`**; catálogo vacío honesto |
| Evidencia | `RepoTecnico/evidencias/paso3-4-demo-operacion-2026-10-19.json` |

### Defecto detectado y corregido en la ventana

El worker **no tenía inyectados `CHECKIN_SECRET_KEY` ni `AES_SECRET_KEY`**: al consolidar el primer
`NFTSold` fallaba con «Secreto obligatorio no configurado», la noche se quedaba en `CONFIRMING` y la
venta no llegaba a `SOLD`. Se añadieron ambos secretos al worker (revisión `00023-w9c`) y se
**reindexó** el índice off-chain desde `DEPLOYMENT_BLOCK` (reset-index aplicado; ver evidencia). Tras
el arreglo, la venta se consolidó correctamente.

### Operación

| Elemento | Valor |
|---|---|
| Roles hot-wallets | `MINTER` → cuenta 1 (tx `0x566504c9…`), `BURNER` → cuenta 2 (tx `0x6ad35155…`), `RECEPTION` → cuenta 3 (tx `0xddf2ff34…`) · **aditivo**: la cuenta 0 conserva los 7 |
| Quema | worker `00024-q2h` con `BURNER_WALLET_PRIVATE_KEY` (secreto) · `BURN_HOUR_LOCAL=12` · `BURN_TIMEZONE=Europe/Madrid` · `BURNER_MIN_BALANCE_NATIVE=1` → `/health` `burn.scheduler=enabled`, `lastRun=null` |
| Jobs | `hotel-mcp-inject-data` **eliminado**; `hotel-mcp-reset-all` actualizado a C2 (`0xF8b1…25F4`, bloque `5655378`); `hotel-mcp-reconcile-rooms` se conserva |
| SMTP | **pendiente de credenciales reales** (el worker sigue `down` por `emailDegraded`; web/mcp/worker procesan con normalidad) |

**Verificación:** `/health` del worker → `lag=0`, `aggregateLag=0`, `anchor.scheduler=enabled`,
`burn.scheduler=enabled`; `/api/nfts` 2 noches con los estados de arriba; `/api/public/rooms` 1
reservable (201). El 503 de `/health` es **solo** el email degradado, no pérdida de indexación.

---

## 89. Release v69 — F4 desplegado: Suite de Mantenimiento y firma EIP-712 operativas (2026-10-19)

**Qué se desplegó.** El cierre de **F4** (suite del jefe de mantenimiento, firma selectiva y
preventivo con firma obligatoria) sobre Besu 81234, después de commitear el bloque `7b97e04` y sus
correcciones de la validación real.

| Elemento | Valor |
|---|---|
| Imagen web | **`web:v69`** (build `efc1a67d…`, SUCCESS, desde *worktree* limpio) |
| Revisión web | **`hotel-mcp-web-00075-xqt`** al 100 % (rollback: `00074-vd5`/v67 → `00073-9j5`/v66) |
| Env nueva web | `HOTEL_OPERATIONS_CONTRACT_ADDRESS=0x222d74f33b0d07687a769a44399e2272a4cb9ffe` · `HOTEL_OPERATIONS_DEPLOYMENT_BLOCK=5491513` |
| Roles on-chain (`HotelOperations`) | `HEAD_MAINTENANCE_ROLE` concedido a la cuenta operadora 0 `0xf39F…2266` (tx `0xa2d97669…71c8e3`, bloque 5743421) y `backupForRole` del rol a la misma cartera (tx `0x727a2cf4…d82b223`, bloque 5743424) |
| Wallet del rol (off-chain) | `operator_wallets`: `admin@hotel.es` → `HEAD_MAINTENANCE` → `0xf39F…2266`, activa |
| Worker | `hotel-mcp-worker-00024-q2h` (anchor `enabled`); ancla las firmas nuevas con el relayer |

### Verificación firmada de extremo a extremo (habitación 201)

| Paso | Resultado |
|---|---|
| `POST /api/mantenimiento/signatures` (ROOM_BLOCK) | 201 con TypedData del dominio `HotelOperations` |
| Firma EIP-712 con la wallet del jefe + `PATCH /signatures/[id]` | 200 · estado `SIGNED` |
| `POST /rooms/[id]/block` | 200 · `publication_status` **PUBLISHED → MAINTENANCE** · `/api/public/rooms` deja de ofrecerla |
| Anclaje del worker | **`MINED`** · tx `0xbbc88ac6…d6ed7b37` · bloque **5743796** · `success` |
| Desbloqueo firmado | 200 · `publication_status` **MAINTENANCE → PUBLISHED** (restaurado) · vuelve a `/api/public/rooms` |
| Anclaje del desbloqueo | firma confirmada al outbox; patrón `MINED` verificado con la firma previa (tx `0x9c669791…e2161`, bloque 5743841) |

### Hallazgos reales corregidos en la ventana

1. **Nonce EIP-712**: es `bytes32`; el hook de firma lo convertía a `BigInt` y habría fallado
   siempre con `BytesSizeMismatchError`. Corregido y verificado firmando el TypedData real.
2. **Carrera anclaje ↔ aplicación**: si el worker ancla entre la confirmación y la aplicación, la
   firma pasa a `MINED`; `assertSignatureAuthorizes` ahora acepta `SIGNED` **o** `MINED`.
3. **Fuga del payload RSC**: el layout ocultaba el árbol pero el payload de la página viajaba igual
   en la respuesta; un anónimo recibía los datos del dashboard. Cada página revalida la sesión
   (guardián en `maintenance-suite.test.ts`) y ahora el HTML anónimo no contiene esos datos.
4. **Duplicado de firma**: repetir la misma operación mientras la firma anterior sigue viva responde
   **409 `SIGNATURE_DUPLICATE`** con mensaje accionable (antes 500).

**Pruebas:** `@hotel/shared` **67 ficheros / 710 pruebas**; `@hotel/web` **120 ficheros / 1.128
pruebas**; typecheck limpio; `eslint` **0 errores**; guardianes `boundaries`, `control-boundary`,
`public-suite`, `suite-access` e `i18n` en verde.

**Evidencia:** `RepoTecnico/evidencias/f4-mantenimiento-firma-2026-10-19.json`.

**Deuda declarada:** E2E de navegador con wallet inyectada (manual); una firma obsoleta bloquea
re-preparar el mismo payload hasta que el Soporte la revoque (F9); `HEAD_KEEPER_ROLE` y su wallet se
configuran en la ventana de F6.

---

## 90. Release v71 — F6 desplegado: Suite Ama de llaves (2026-10-19)

**Qué se desplegó.** El cierre de **F6** (suite del ama de llaves y de la camarera) sobre Besu
81234: tablero de los cinco estados canónicos + mantenimiento en tiempo real, turnos, asignaciones,
inspección con firma **opcional por flag** y reporte de averías hacia Mantenimiento.

| Elemento | Valor |
|---|---|
| Imagen web | **`web:v71`** (build `024b21c6…`, SUCCESS, *worktree* limpio) |
| Revisión web | **`hotel-mcp-web-00077-xm6`** al 100 % (rollback: `00076-5xn`/v70 → `00075-xqt`/v69) |
| Rol on-chain | `HEAD_KEEPER_ROLE` a la cuenta 3 `0x90F7…b906` (tx `0xc285c22e…03a7a`, bloque 5744586) y `backupForRole` a la cuenta 0 (tx `0x9ed8f94c…2a6b6`, bloque 5744588) |
| Wallet del rol | `operator_wallets`: `ama@hotel.es` → `HEAD_KEEPER` → `0x90F7…b906` (el usuario de acceso lo crea F9) |
| Flag de inspección | `platform_settings.inspection_requires_signature`: probado ON y **restaurado a off** (ausente = `false`, D-C23) |
| Worker | `hotel-mcp-worker-00024-q2h`; el outbox ancla las firmas `INSPECTION` con el relayer |

### Verificación en la ventana

| Comprobación | Resultado |
|---|---|
| Rutas autenticadas (owner) | `/ama-de-llaves`, `/turnos`, `/asignaciones`, `/inspecciones`, `/suministros` → **200** con sus `data-testid`; anónimo → acceso sin filtrar datos |
| Tablero | 50 habitaciones · 6 estados · SSE `stream?view=rooms`; `state-board` **p50 166,9 ms / p95 426,7 ms** (RNF-M-05 < 500 ms) |
| Inspección con flag **off** | APPROVED **201**, `signature_id = null`, habitación `CLEAN` y `publication_status` **sin cambios** (D-C9) |
| Inspección con flag **on** | sin firma → **409 `SIGNATURE_REQUIRED`**; con firma EIP-712 del rol `HEAD_KEEPER` → **201** y firma enlazada |
| Anclaje de inspecciones | **3 firmas `INSPECTION` MINED** (ej. tx `0x909699c0…cdbd3` bloque 5745251 y `0xbd83dc93…bdcc` bloque 5745252, `success`) |
| Rechazo | habitación **DIRTY** y asignación devuelta a **PENDING** (también cuando la UI no envía `assignmentId`: corregido en el repositorio) |
| Reporte de avería | ticket `OPEN` en Mantenimiento con `reported_by_role`; la habitación queda marcada `MAINTENANCE` en el tablero |

**Hallazgo real corregido en la ventana:** el rechazo dejaba la asignación en `DONE` al no conocer la
UI el `assignmentId`; el repositorio resuelve ahora la última asignación de la habitación
(CU-V-22) y la devuelve a `PENDING`. 2 pruebas nuevas (34 en la suite del repositorio).

**Pruebas:** dominio+repositorios F6 **81 dirigidas** en verde; guardianes de suite/i18n/a11y en
verde; `typecheck` limpio; `eslint` 0 errores. **Deuda:** operadores `HEAD_KEEPER`/`HOUSEKEEPER` los
da de alta F9; E2E de navegador con wallet inyectada, manual; `/ama-de-llaves/danos` reservada a F7.

**Evidencia:** `RepoTecnico/evidencias/f6-ama-de-llaves-2026-10-19.json`.

---

## 91. Releases v73/v74 — F7 (daños) y F10 (Recepción vNext y cierre) (2026-10-19)

| Elemento | Valor |
|---|---|
| web | **`hotel-mcp-web-00080-7d4`** (100 %) · imagen **`web:v74`** (cierre F10; rollback `v73`/`00079-j58`) |
| MCP | **`hotel-mcp-mcp-00022-g94`** · imagen **`mcp:v74`** con `OPERATIONS_CONTRACT_ADDRESS=0x222d74f3…b9ffe` y `OPERATIONS_DEPLOYMENT_BLOCK=5491513`; herramienta **`getOperationalActions`** (solo lectura) |
| F7 validado | alta sin firma on-chain → reclamo del huésped → resolución aceptada en recepción → check-out que liquida el cargo en el folio (`RESOLVED_ACCEPTED`, cargo `PAID`) |
| Correcciones | casts en `resolveNotification`; `housekeeping_room_logs` a `VARCHAR(20)` (PENDING_CLEANING) y sincronía triple |
| F10 validado | reporte de incidencias por recepción, publicación manual de la venta, **D-C40 308** `/housekeeping → /ama-de-llaves`, MCP solo lectura, p95 tablero 426,7 ms |
| Evidencia | `RepoTecnico/evidencias/f7-f10-cierre-fase3-2026-10-19.json` |

**Gates de la ruta crítica:** F4/F6/F7 desplegadas y validadas; F10 entregado. El E2E Playwright con
wallet inyectada se mantiene como prueba manual de ventana (el resto de suites y guardianes en verde).


---

## 92. Release v77 — F5 desplegado: terminal de mantenimiento con PIN (2026-10-19)

| Elemento | Valor |
|---|---|
| web | **`web:v77`** → revisión **`hotel-mcp-web-00085-742`** (100 %) |
| worker | **`worker:v77`** → revisión **`hotel-mcp-worker-00026-5m2`** (aplica `preventive_tasks.assigned_to/updated_at`) |
| Configuración | `terminal_operators`: `tecnico1`/`tecnico2` (MAINTENANCE_TECH), PIN bcrypt coste 12; tarea preventiva e incidencia asignadas para la demo |
| Validación | login PIN 200; sin sesión `/terminal` sirve solo el login y la API responde 401; cierre de tarea → `PENDING_VERIFICATION`; incidencia `IN_PROGRESS→RESOLVED`; reporte de avería 201 con `reported_by_role=MAINTENANCE_TECH`; 5 intentos fallidos → **423** con 900 s de bloqueo |
| Hallazgo corregido | el reporte desde recepción escribía `RECEPTION_ROLE` en `reported_by_role`, que el CHECK no admite; ahora se mapea a `RECEPTION` |
| Evidencia | `RepoTecnico/evidencias/f5-terminal-pin-2026-10-19.json` |


---

## 93. Releases v78 — F8 desplegado: suministros con recordatorio y SLA de validación (2026-10-19)

| Elemento | Valor |
|---|---|
| web | **`web:v78`** → **`hotel-mcp-web-00086-m62`** |
| worker | **`worker:v78`** → **`hotel-mcp-worker-00027-qfn`** (planificadores de suministros y SLA) |
| Suministros | 4 alertas abiertas con `last_reminded_at` persistido; umbral por artículo (cerrar/abrir alerta conciliada) |
| SLA | Tarea a 25 h → `PENDING_VERIFICATION_EXPIRED` y cola del jefe con `sla-countdown`; validación → `VALIDATED` |
| Evidencia | `RepoTecnico/evidencias/f8-suministros-sla-2026-10-19.json` |


---

## 94. Releases v79/v80 — F9 desplegado: administración, gobernanza y soporte (2026-10-19)

| Elemento | Valor |
|---|---|
| web | `web:v79` → `00087-zbk` (F9) y **`web:v80`** → **`hotel-mcp-web-00088-gcw`** (informe CU-V-26 y cola resiliente) |
| Wallets | Grant on-chain `0xdde5c6fa…` → asignación 201; baja con rol activo → **409**; revoke `0x9a47ed9d…` → baja 200 (orden on-chain primero) |
| Flags | TOTP + firma `CONFIG` (prepare → sign → confirm `SIGNED` → apply); flag obligatorio sin firma → 409 |
| Operarios | Alta con PIN de un solo uso, rotación, baja y reactivación validadas |
| Anclajes | 8 firmas visibles en la cola con el worker degradado (`workerAvailable=false`) |
| Informe | `/ama-de-llaves/informes` con 3 filas de productividad (RF-K-10/CU-V-26) |
| Evidencia | `RepoTecnico/evidencias/f9-admin-gobernanza-2026-10-19.json` |

---

## 95. Release v82 — manuales de las suites y Ayuda ampliada desplegados en producción (2026-10-20)

**Qué se desplegó.** El commit `2361774` (cierre documental: manuales técnicos/literales de las suites
F4–F10, PDFs, nueva sección «Manuales de las suites (personal)» en `/ayuda` y ADR-31/plan de la APK).
**Solo web**: worker y MCP no cambiaron.

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| web | `…/hotel-mcp/web:v82` | ✅ SUCCESS `57285393-16ab-4b15-9ac2-8e7007f52820` (3m56s) | `hotel-mcp-web-00146-not` | **100 %** |
| worker | `worker:v78` (sin cambios) | — | vigente | 100 % |
| mcp | `mcp:v74` (sin cambios) | — | vigente | 100 % |

**Método.** `gcloud builds submit` con las variables públicas del registro local
(`NEXT_PUBLIC_RPC_URL` Besu, `CHAIN_ID=81234`, contrato `0xf8b1…25f4`, bloque `5655378`, subasta
`0x934A…45A3` y bloque `5655388`, WalletConnect `de05…` y `NEXT_PUBLIC_SITE_URL` de producción).
Despliegue **canario** con `--image --no-traffic --tag=v82`, verificación por URL etiquetada y promoción
con `update-traffic --to-latest`. Se desplegó **solo con `--image`**, conservando la configuración.

| Comprobación | Resultado |
|---|---|
| Configuración conservada | **32 variables y 9 secretos** (idénticos a la revisión anterior) |
| Canario `/health/ready` | 200 `{"status":"READY","dependencies":{"postgres":"UP","redis":"UP","polygonRPC":"UP"}}` |
| Canario `/`, `/ayuda`, `/catalogo` | **200** |
| Canario `/ayuda/01-mantenimiento` | **200** (157 KB) |
| Canario `/manual/manual-01-mantenimiento.pdf` | **200** (156 KB, PDF descargable) |
| Contenido nuevo en `/ayuda` | «Manuales de las suites (personal)» presente |
| Promoción a producción | `hotel-mcp-web-00146-not` sirve **100 %**; imagen `web:v82` |
| Producción tras promover | `/`, `/catalogo`, `/ayuda`, `/ayuda/01-mantenimiento`, PDF y `/health/ready` → **200** |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00089-9gm=100` (v81).

**Nota.** La ayuda existente y las 3 guías generales no cambian; se añaden 7 guías de suites con su PDF e
infografía. Los manuales de la APK se generarán cuando exista build de la app (ADR-31).


---

## 96. Release MCP v78 — manual del huésped completo en el conocimiento del asistente (2026-10-20)

**Qué se desplegó.** El manual del huésped completado con los datos del hotel (propuesta del equipo):
ubicación, horarios de entrada/salida, servicios con precios, normas, recepción y FAQ. Se regeneró el
índice de conocimiento (**313 fragmentos de 21 manuales**) y se desplegó **solo el MCP** (la web recibe
las respuestas del asistente por MCP en tiempo de ejecución; no requiere rebuild).

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| mcp | `…/hotel-mcp/mcp:v78` | ✅ SUCCESS `c27026aa-0421-46a5-95fa-12547eb5b888` (2m31s) | `hotel-mcp-mcp-00035-sok` | **100 %** |
| web | `web:v82` (sin cambios) | — | `hotel-mcp-web-00146-not` | 100 % |
| worker | `worker:v78` (sin cambios) | — | vigente | 100 % |

**Método.** Canario con `--no-traffic --tag=v78`, verificación con el cliente MCP real (7 herramientas)
y consultas a `searchHotelManuals`, y promoción con `update-traffic --to-latest`.

| Comprobación | Resultado |
|---|---|
| Canario `/health` | **200** |
| `tools/list` (canario y producción) | **7 herramientas** |
| «¿Cuál es la dirección del hotel?» | devuelve el fragmento del manual con «Paseo del Puerto, 12 (03001) Alicante» |
| «¿A qué hora es el check-in?» | «a partir de las 15:00» |
| «¿Hasta qué hora está abierta la recepción?» | «24 horas · +34 965 000 000 · urgencias 112» |
| «¿Se admiten mascotas?» / «¿Hay wifi?» | fragmento de servicios con mascotas (15 €/noche) y wifi `MarinaSol_Guest` |
| Promoción | `hotel-mcp-mcp-00035-sok` con `mcp:v78` al 100 % |
| Producción `/health` | **200** |

**Rollback.** `gcloud run services update-traffic hotel-mcp-mcp --region=europe-west1
--to-revisions=hotel-mcp-mcp-00022-g94=100` (mcp:v74).

**Nota.** Los datos del hotel son una **propuesta pendiente de confirmación** del cliente; quedan
documentados en `solicitud-contenidos-cliente.md`. El manual está en `docs/manual-huesped.md`.

---

## 97. Release v83 — guías del huésped con los datos del hotel en la web (2026-10-20)

**Qué se desplegó.** El módulo `huesped.generated.ts` regenerado tras completar los datos del hotel en
las guías del huésped (01, 10, 11, 12 y 17). La web `/ayuda/huesped` ya muestra horarios, servicios con
precios, normas y recepción. El MCP ya respondía con esos datos desde `mcp:v78`; con esta release queda
también visible en la web.

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| web | `…/hotel-mcp/web:v83` | ✅ SUCCESS `8a620f50-0491-411b-aad3-09a47730002a` (4m49s) | `hotel-mcp-web-00148-wuf` | **100 %** |
| mcp | `mcp:v78` (sin cambios) | — | `hotel-mcp-mcp-00035-sok` | 100 % |
| worker | `worker:v78` (sin cambios) | — | vigente | 100 % |

**Método.** Regeneración con `corepack pnpm --filter @hotel/web run huesped` (**17 casos · 73
secciones · 7 ilustraciones**) y guardián `huesped-sync.test.ts` en verde (10/10). Canario
`--no-traffic --tag=v83`, verificación por URL etiquetada y promoción.

| Comprobación | Resultado |
|---|---|
| Configuración conservada | **32 variables y 9 secretos** |
| Canario `/health/ready` | **200** |
| Canario `/ayuda/huesped` y guías 10/11/12/17 | **200** |
| Guía 10 (entrada) | muestra «15:00» |
| Guía 11 (extras) | muestra «12 €» |
| Guía 12 (salida) | muestra «15:00» y «25 €» |
| Guía 17 (recepción) | muestra «24 horas» y «+34 965 000 000» |
| Producción tras promover | `/ayuda/huesped` y guías → **200**; datos nuevos visibles |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00146-not=100` (v82).

---

## 98. Release v85 — la quema programada sobrevive a un revert sin datos de Besu (2026-10-21)

**Qué pasó.** La quema programada del **2026-10-20** falló en producción: `/health` publicó
`burn.lastRun = {reason: "ERROR", burnedTokensCount: 0}` y los logs del worker mostraron
`[Burner] Fallo en el ciclo de quema: Execution reverted with reason: Execution reverted.` cada 5 min
entre las **10:01 y las 10:56 UTC** (hora de la quema, `BURN_HOUR_LOCAL=12` Europe/Madrid), con **8
noches candidatas**. El planificador dejó de reintentar al salir de la hora y **la quema del día no se
ejecutó**.

**Causa raíz (dos capas).**

1. El índice `nfts` tenía **9 filas `AVAILABLE` caducadas de la habitación 101**
   (`10120261007`, `…1008`, `1012`–`1015`, `1018`–`1020`) registradas por el back-office con
   `allowUnanchored=true` (`on_chain_anchored = FALSE`, hash centinela) **que nunca se mintearon**
   on-chain: `ownerOf` revierte con `ERC721NonexistentToken`. `getUnsoldExpiredNFTs` las devolvía como
   candidatas y `burnExpired` revertía al intentar quemar tokens inexistentes.
2. **Besu devuelve el revert sin datos decodificables**, así que `viem` lo expone como
   `ContractFunctionExecutionError → CallExecutionError → ExecutionRevertedError`, **no** como
   `ContractFunctionRevertedError`. `isRevertError` solo reconocía esta segunda forma: el revert se
   clasificaba como **caída de red** y `canSimulate` lo propagaba, tumbando el ciclo completo sin
   llegar al reintento token a token ni a la reconciliación del índice (diseño que sí existía desde
   H-01). El primer arreglo (`824f36a`) se quedó corto porque en la **imagen Docker conviven dos
   copias físicas de `viem`** (peers de `zod` distintos para worker y shared): el error del cliente del
   worker **no es `instanceof`** las clases que importa `shared`, así que se reconoce también por
   **nombre** y recorriendo la cadena de `cause` (`5c19706`).

**Corrección.** `packages/shared/src/burner/service.ts` (`isRevertError` reconoce ambas formas de
revert y no depende de la identidad de las clases entre copias de viem) + regresión en
`burner.test.ts` (23/23: cadena real de viem, error de otra copia, red que no es revert). Con el
arreglo, el ciclo degrada como está diseñado: lote → token a token → `ownerOf` revierte ⇒ la fila
inexistente se **reconcilia como `BURNED`** y el ciclo termina `COMPLETED`.

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| worker | **`worker:v85`** | ✅ SUCCESS `66028421-5953-4e90-97e0-9315bf937860` (2m54s) | **`hotel-mcp-worker-00033-zoy`** | **100 %** |
| web | `web:v83` (sin cambios) | — | `hotel-mcp-web-00148-wuf` | 100 % |
| mcp | `mcp:v78` (sin cambios) | — | `hotel-mcp-mcp-00035-sok` | 100 % |

**Método de verificación.** Canario `--no-traffic --tag=v85` con `BURN_INTERVAL_MS=60000` (modo
forzado de dev) para ejecutar un ciclo real sin esperar a las 12:00; la revisión limpia
(`00033-zoy`, **sin** `BURN_INTERVAL_MS`) se desplegó después y se promovió con `update-traffic
--to-latest`. Se conservó la configuración (**20 variables + 7 secretos**). Las revisiones de canario
(`00031-waw` v84 fallida y `00032-mez` forzada) se eliminaron al terminar.

| Comprobación | Resultado |
|---|---|
| Ciclo forzado (revisión `00032-mez`) | **9 candidatas → `COMPLETED` · burnedTokensCount 0** |
| Reconciliación | Las 9 noches («ya no existe on-chain») → **`BURNED`**, sin alerta (no había inventario vivo) |
| Base de datos | `10120261007..1020` → **9 filas `BURNED`**; caducadas `AVAILABLE` sin anclar: **0**; caducadas `AVAILABLE` (cualquiera): **0** |
| Cerrojo diario | Retenido (26 h) tras el ciclo `COMPLETED`: la quema del 2026-10-21 no se repite |
| Producción | `hotel-mcp-worker-00033-zoy` al 100 %; `lag 0`, `aggregateLag 0`, `burn.scheduler=enabled`, anchor ok; sin errores en logs |
| `/health` | **503** por `emailDegraded: true` (**SMTP de relleno**, estado conocido §19; no es avería) |

**Rollback.** `gcloud run services update-traffic hotel-mcp-worker --region=europe-west1
--to-revisions=hotel-mcp-worker-00027-qfn=100` (worker:v78). La siguiente quema programada es la del
**2026-10-22 a las 12:00** Europe/Madrid.

Evidencia: [`evidencias/release-v85-quema-2026-10-21.json`](./evidencias/release-v85-quema-2026-10-21.json).

---

## 99. Release v84 — habitaciones publicables y galería persistente en Cloud Storage (2026-10-21)

**Qué se desplegó.** La corrección del bloqueo de publicación de habitaciones (web) y el cambio de
persistencia de la galería: las fotos dejan el disco efímero del contenedor y pasan a un **bucket de
Cloud Storage montado con GCS FUSE**.

**Diagnóstico.** `POST /api/admin/rooms/bulk/publish` devolvía **400 con 0 publicadas** porque solo
**1 de 50** habitaciones tenía fila en `room_images` y publicar exige al menos una foto (D-20). La
interfaz descartaba el detalle `results[]` y mostraba un aviso genérico. La foto de demostración de la
201 apuntaba a un fichero inexistente (`/data/room-images/...` → 404), síntoma del disco efímero.

**Cambios de plataforma (esta release incluye infraestructura).**

| Elemento | Valor |
|---|---|
| Bucket | `gs://hotel-mcp-room-images` (europe-west1, uniform access) |
| IAM | `hotel-mcp-run@hotel-mcp.iam.gserviceaccount.com` → `roles/storage.objectAdmin` |
| Contenido inicial | 103 ficheros de `docs/imagenes` copiados antes de montar |
| Montaje | `--add-volume=name=room-images,type=cloud-storage,bucket=hotel-mcp-room-images --add-volume-mount=volume=room-images,mount-path=/repo/docs/imagenes` |
| Efecto | `roomImagesDir()` sigue apuntando a `/repo/docs/imagenes`; ahora las escrituras de `POST /api/admin/rooms/[id]/images` persisten y las ven todas las instancias |

**Build y despliegue.**

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| web (intermedia) | `…/hotel-mcp/web:v84` | ✅ SUCCESS `ed75798d-dab1-40f4-ac00-1041611c7fb0` (3m48s, `us-central1`) | `hotel-mcp-web-00151-jag` (sustituida) | 100 % |
| web (final) | `…/hotel-mcp/web:v85` | ✅ SUCCESS `617ca456-3579-4bf3-ae5c-68d07724bb24` (3m43s, `us-central1`) | **`hotel-mcp-web-00153-des`** | **100 %** |
| worker / mcp | `worker:v85` / `mcp:v78` (sin cambios) | — | vigentes | 100 % |

**Método.** Canario `--no-traffic --tag=v84` (y después `--tag=v85`), verificación por URL etiquetada
y promoción con `update-traffic --to-latest`. La configuración se conservó (**32 variables + 9
secretos + volumen GCS**). El primer `gcloud builds submit` (pool por defecto) quedó en **QUEUED** y
se canceló; los reintentos con `--region=us-central1` arrancaron y terminaron. Tras el `/push` del
commit `8c3ae9b` (rama `Hotel-DSH-GCP-v3`, en `origin`, `codecrypto` y `github`) se reconstruyó la
imagen **`web:v85`** desde ese mismo commit y se redesplegó, de modo que **producción y repositorio
coinciden**.

**Datos de producción corregidos.** 43 fotos subidas por la API de administración (8 de ellas
sustituyendo galerías con el tipo equivocado) y publicación masiva con TOTP del owner: **49
habitaciones publicadas** (la 201 ya estaba). Estado final: **50/50 `PUBLISHED`**.

| Comprobación | Resultado |
|---|---|
| `/health/ready` (canario y producción) | **200 READY** (postgres, redis, RPC UP) |
| `GET /api/admin/rooms` | 50 habitaciones, **`hasImage: true` en 50** |
| `GET /api/admin/rooms/calendar?date=…` | incluye **`hasImage`**; 50 publicadas |
| `POST /api/admin/rooms/bulk/publish` | **200 · 49 publicadas · 0 fallos** |
| Foto de habitación | `/api/rooms/images/111-Simple-2026-10-21-1.jpg` → **200** |
| Catálogo público | **48 habitaciones**; 101 y 102 excluidas por incidencias de mantenimiento `OPEN` con `blocksSale=true` (D-53) |
| Bucket | **153 objetos** (103 previos + 50 fotos de habitación) |

**Rollback.** `gcloud run services update-traffic hotel-mcp-web --region=europe-west1
--to-revisions=hotel-mcp-web-00148-wuf=100` (web:v83). Las fotos del bucket son compatibles con v83
(las sirve igual `/api/rooms/images/[file]`).

**Pendiente.** Sustituir las fotos de tipo reutilizadas por las del hotel cuando el cliente las
entregue (D-20) y resolver las incidencias abiertas de 101/102 si se quieren vender.

Evidencia: [`evidencias/release-v84-habitaciones-2026-10-21.json`](./evidencias/release-v84-habitaciones-2026-10-21.json).

---

## 100. Release v86 — publicación con minteo on-chain obligatorio (D-85 · ADR-32) (2026-10-21)

**Qué se desplegó.** Publicar una habitación (unitario **y masivo**) ya no la publica directamente:
deja un job en `room_mint_jobs` y responde **202**. El worker relayer registra la habitación, ancla la
huella y mintea **la primera noche**; solo si todo confirma la habitación queda `PUBLISHED`. Si falla,
sigue en `DRAFT` y el job queda `FAILED`. Flag web `MINT_ON_PUBLISH_ENABLED=true` (sin él se recupera el
flujo anterior sin desplegar).

**Provisión on-chain (una vez).**

| Elemento | Valor |
|---|---|
| Hot wallet dedicada | `0xD439542F90E14CF7755a1C5c5bed90Ab952a6Ddf` |
| Saldo inicial | **20 ETH** (desde la cuenta deployer `0xf39F…2266`) |
| Roles | `DEFAULT_ADMIN_ROLE` (registerRoom/publishRoom) + `MINTER_ROLE` (mint), `hasRole` = true |
| Clave | Secreto GCP **`hotel-minter-relayer-private-key`**, inyectado **solo en el worker** |
| Gas | Besu legado: `MINT_TX_GAS_PRICE_WEI=1000`, `MINT_TX_GAS_LIMIT=900000` |

**Build y despliegue.**

| Componente | Imagen | Build | Revisión sirviendo | Tráfico |
|---|---|---|---|---|
| worker | `…/hotel-mcp/worker:v86` | ✅ SUCCESS `f589e4e9-055d-467a-9234-1d7e2c8f92a1` | **`hotel-mcp-worker-00036-duc`** | **100 %** |
| web | `…/hotel-mcp/web:v86` | ✅ SUCCESS `ea9c4207-1266-400a-bc49-d3c866635e1b` | **`hotel-mcp-web-00155-cit`** | **100 %** |

**Método.** Canario `--no-traffic --tag=v86` en ambos servicios, verificación por URL etiquetada y
promoción con `update-traffic --to-latest`. Configuración conservada: worker **21 variables + 8
secretos** (se añadió el del relayer), web **32 variables + 9 secretos + volumen GCS** (se añadió
`MINT_ON_PUBLISH_ENABLED`). La migración de `room_mint_jobs` la aplica el worker al arrancar; en sus
logs aparece `outbox de publicación con minteo on-chain activo`.

**Verificación E2E (producción real).** Se prepararon 998 (SIMPLE) y 999 (SUITE) con foto y se encolaron
sus jobs; el worker las procesó en ~10 s cada una:

| Comprobación | Resultado |
|---|---|
| `isRoomRegistered(998/999)` | **true** |
| `publicationHashOf` | Coincide con la huella calculada de la ficha |
| `ownerOf(99820261022 / 99920261022)` | Tesorería `0xf39F…2266` |
| Transacciones | `register` + `publish` + `mint` reales por habitación; DB con publicación anclada y job `DONE` |
| Reversión por fallo (997 sin foto) | Job `FAILED` («no tiene ninguna foto, D-20»), habitación **DRAFT**, 0 publicaciones |
| Limpieza | 997/998/999 archivadas (`OUT_OF_SERVICE`); catálogo sigue con **48** visibles |
| Producción | `/health/ready`, `/`, `/catalogo`, `/api/public/rooms` → **200** |

**Rollback.** Web: `MINT_ON_PUBLISH_ENABLED` vacío + `--to-revisions=hotel-mcp-web-00153-des=100`;
worker: volver a `worker:v85`. La tabla `room_mint_jobs` es aditiva y no rompe versiones anteriores.

**Pendiente.** Salud del outbox (jobs `PENDING`), alerta de saldo del relayer, backfill de las 50 ya
publicadas y rotación de la hot wallet.

Evidencia: [`evidencias/release-v86-publicacion-minteo-2026-10-21.json`](./evidencias/release-v86-publicacion-minteo-2026-10-21.json).



---

## 101. Reset de publicaciones y despliegue de un HotelNights limpio (2026-10-22)

**Motivo.** Eliminar todas las publicaciones de habitaciones. El contrato es inmutable: no existen
`unpublish`/`unregister`, `publishRoom` rechaza `bytes32(0)` y solo se pueden quemar noches caducadas
(no había ninguna). Por eso la cadena limpia se consigue con un **contrato nuevo**.

**Contratos desplegados (Besu, chainId 81234).**

| Contrato | Dirección | Bloque | Notas |
|---|---|---|---|
| `HotelNights` | **`0xD604C06206f6DeDd82d42F90D1F5bB34a2E7c5dd`** | **5845688** | treasury/admin `0xf39F…2266`; `minListingPrice` 0.01 ETH |
| `NightAuction` | `0xBA6BfBa894B5cAF04c3462A5C8556fFBa4de6782` | 5845697 | recibe `AUCTION_ROLE` del `HotelNights` nuevo |

Roles concedidos en el `HotelNights` nuevo: relayer de publicación `0xD439…6Ddf` (`DEFAULT_ADMIN` +
`MINTER`), burner `0x3C44…93BC` (`BURNER`), recepción `0x90F7…b906` (`RECEPTION`). Registro:
`packages/shared/deployments/81234.json` (sincronizado con `pnpm --filter @hotel/contracts sync`) y
`packages/contracts/deployments/81234-auction.json`. El contrato anterior `0xf8b1…25f4` queda huérfano
pero **no se puede borrar** de la cadena; simplemente deja de usarse.

**Datos off-chain.** Job de limpieza dentro de la VPC: borrado de `room_publications`, `room_mint_jobs`,
`room_status_history` y del índice de la cadena anterior (`nfts`, `listings`, `sale_events`, `reviews`,
`checkin_contingency_logs`); habitaciones de prueba 997/998/999 eliminadas; las **50 reales pasan a
`DRAFT`** conservando sus fotos; checkpoints del worker reiniciados al contrato nuevo (bloque 5845716).
No se tocaron reservas, housekeeping, mantenimiento, operadores, contenido ni ajustes.

| Componente | Imagen | Build | Revisión | Tráfico |
|---|---|---|---|---|
| web | `web:v87` | `d2fbfe39-9d1e-4c02-9cbc-7b4bc668b28f` SUCCESS | **`hotel-mcp-web-00157-wer`** | 100 % |
| worker | `worker:v87` | `058a7382…` SUCCESS | **`hotel-mcp-worker-00039-fad`** | 100 % |

**Configuración.** Web: `NEXT_PUBLIC_CONTRACT_ADDRESS=0xD604…c5dd`,
`NEXT_PUBLIC_DEPLOYMENT_BLOCK=5845688`, `NEXT_PUBLIC_AUCTION_ADDRESS=0xBA6B…6782`,
`NEXT_PUBLIC_AUCTION_DEPLOYMENT_BLOCK=5845697`, `MINT_ON_PUBLISH_ENABLED=true`. Worker:
`CONTRACT_ADDRESS=0xD604…c5dd`, `DEPLOYMENT_BLOCK=5845688`. Conservados el volumen GCS de imágenes y el
resto de secretos.

| Comprobación | Resultado |
|---|---|
| Cadena nueva | `getLogs` desde 5845688: **0 `RoomRegistered`, 0 `RoomPublished`, 0 `Mint`** |
| DB | **50 rooms DRAFT · 0 publicaciones · 0 nfts · 0 jobs · 50 fotos** · 0 habitaciones de prueba |
| Web producción | `/health/ready`, `/`, `/catalogo`, `/api/public/rooms` → **200**; `{"rooms":[]}` |
| Worker | `/health` **ok**, `lag 0`, listener y outbox de publicación activos sobre el contrato nuevo |

**Rollback.** No existe rollback de cadena. Volver al estado anterior exigiría repuntar
`CONTRACT_ADDRESS` a `0xf8b1…25f4` y restaurar el índice desde backup; no se recomienda.

Evidencia: [`evidencias/reset-publicaciones-contrato-nuevo-2026-10-22.json`](./evidencias/reset-publicaciones-contrato-nuevo-2026-10-22.json).


---

## 102. Verificación de publicación con imagen por tipo (unitario y masivo) — 6 habitaciones para el 25-oct (2026-10-22)

**Qué se verificó.** Que publicar (unitario y masivo) use la **imagen del tipo real** de la habitación,
y que haya **2 habitaciones de cada tipo disponibles para el 25 de octubre**. Contrato:
`HotelNights` `0xD604C06206f6DeDd82d42F90D1F5bB34a2E7c5dd`.

| Vía | SIMPLE | DOBLE | SUITE |
|---|---|---|---|
| Unitaria | 103 | 116 | 201 |
| Masiva (bulk) | 104 | 117 | 202 |

**Comprobaciones.** Cada una de las 6 portadas es `<nº>-<Tipo>-…jpg` y se sirve por
`/api/rooms/images/…` con **200 image/jpeg**; la metadata on-chain (`tokenURI`) de las noches del
23/24/25-oct usa el **CID del tipo** correcto (`simple`/`doble`/`suite`); el catálogo público devuelve
solo esas 6 habitaciones y `GET /api/nfts?...dateFrom=2026-10-25&dateTo=2026-10-25` devuelve **6
noches** (2 por tipo).

**Incidencia operativa (importante).** Cloud Run mantenía con vida la revisión etiquetada
`hotel-mcp-worker-00036-duc` (`worker:v86`) aunque el 100 % del tráfico era `00039-fad`; esa revisión
antigua reclamó los jobs y los ejecutó contra el **contrato anterior**. Se eliminó la revisión antigua
y se repitió la publicación sobre el contrato nuevo. Además se retiró del índice el token
`10320261024` (metadata de prueba, inmutable on-chain). El operador de QA se desactivó.

| Recurso | Valor final |
|---|---|
| Worker | `hotel-mcp-worker-00039-fad` (`worker:v87`, contrato nuevo) |
| Web | `hotel-mcp-web-00157-wer` (`web:v87`) |
| Publicaciones ancladas | 6 (`room_publications.on_chain_anchored = true`) |
| Índice | Oct-23: 6 · Oct-24: 5 · Oct-25: 6 noches |

Evidencia: [`evidencias/verificacion-publicacion-imagen-tipo-oct25-2026-10-22.json`](./evidencias/verificacion-publicacion-imagen-tipo-oct25-2026-10-22.json).


---

## 103. Publicación masiva acotada a la fecha seleccionada — D-86 · ADR-33 (2026-10-22)

**Qué se corrigió.** El panel del día ya envía `date` en `POST /api/admin/rooms/bulk/publish`; el
endpoint la valida (AAAA-MM-DD, no pasada) y la guarda como `room_mint_jobs.target_date`; el worker
mintea **esa noche** y registra la ventana de publicación `[fecha 00:00Z, fecha 23:59:59.999Z]`. Sin
fecha se mantiene el comportamiento anterior (primera noche, ventana abierta).

**Migración.** `ALTER TABLE room_mint_jobs ADD COLUMN IF NOT EXISTS target_date DATE NULL;` aplicada por
el worker al arrancar. Artefactos sincronizados: `diccionario_datos.md`, `diagrama_er.md`,
`base_datos.sql`.

**Despliegue.**

| Componente | Imagen | Build | Revisión | Tráfico |
|---|---|---|---|---|
| worker | `worker:v88` | `48df2349-8de7-42e8-8421-d34ef5a8f72b` SUCCESS | **`hotel-mcp-worker-00043-koz`** | 100 % |
| web | `web:v88` | `440559a5-278a-43a7-bed3-d4aa3dedd47c` SUCCESS | **`hotel-mcp-web-00159-quj`** | 100 % |

**Verificación en producción.** Bulk publish de 107 y 118 con `date=2026-11-10`: respuesta `202
{queued:2, date:2026-11-10}`; ventana de las dos publicaciones limitada al 10-nov; calendario solo
publica el 10-nov (23-oct, 11-nov y 1-dic quedan no publicados); `GET /api/nfts` del 10-nov devuelve
exactamente 107 y 118 y el 11-nov devuelve 0.

**Prevención operativa.** Se eliminó la revisión anterior del worker tras promover v88 para que
ninguna instancia antigua (sin soporte de `target_date`) procesara jobs de fecha. El operador QA de la
prueba se desactivó. Los tokens sobrantes del ensayo previo (10720261023/11820261023) se retiraron del
índice; son inmutables on-chain.

Evidencia: [`evidencias/verificacion-publicacion-masiva-fecha-2026-10-22.json`](./evidencias/verificacion-publicacion-masiva-fecha-2026-10-22.json).


---

## 104. Segunda limpieza total de publicaciones y HotelNights v2 (2026-10-22)

**Motivo.** Eliminar las publicaciones de las habitaciones creadas. Como la cadena es inmutable, la
cadena limpia exige un `HotelNights` nuevo; off-chain se despublica y se borran los registros de
publicación y el índice, conservando habitaciones y fotos.

**Contratos desplegados (Besu, chainId 81234).**

| Contrato | Dirección | Bloque |
|---|---|---|
| `HotelNights` | **`0x8b1B398b9c49AFE6394aaE438f6F2E8039120253`** | **5848830** |
| `NightAuction` | `0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a` | 5848838 |

Roles concedidos: relayer `0xD439…6Ddf` (DEFAULT_ADMIN + MINTER), burner `0x3C44…93BC` (BURNER),
recepción `0x90F7…b906` (RECEPTION), subasta `0x42E5…5b8a` (AUCTION_ROLE). Registro:
`packages/shared/deployments/81234.json` y `packages/contracts/deployments/81234-auction.json`
(sincronizados). Quedan huérfanos e inmutables los contratos `0xf8b1…25f4` y `0xD604…c5dd`.

**Datos off-chain.** Job de limpieza dentro de la VPC: borrado de `room_publications`,
`room_mint_jobs`, `room_status_history` y del índice (`nfts`, `listings`, `sale_events`, `reviews`,
`checkin_contingency_logs`); las **50 habitaciones pasan a `DRAFT`** conservando sus 50 fotos; los
checkpoints del worker se reiniciaron al contrato nuevo (bloque 5873504).

| Componente | Imagen | Build | Revisión | Tráfico |
|---|---|---|---|---|
| worker | `worker:v89` | `f2b7a2c2-d491-47f0-9116-6e70a7241e40` SUCCESS | **`hotel-mcp-worker-00046-tad`** | 100 % |
| web | `web:v89` | `bc4bfd0b-23a7-4e3d-81d5-c9a0b1e6bc71` SUCCESS | **`hotel-mcp-web-00161-pux`** | 100 % |
| mcp | `mcp:v78` (sin cambio de imagen) | — | **`hotel-mcp-mcp-00027-cfv`** | 100 % |

**Configuración.** Web: `NEXT_PUBLIC_CONTRACT_ADDRESS=0x8b1B…0253`,
`NEXT_PUBLIC_DEPLOYMENT_BLOCK=5848830`, `NEXT_PUBLIC_AUCTION_ADDRESS=0x42E5…5b8a`,
`NEXT_PUBLIC_AUCTION_DEPLOYMENT_BLOCK=5848838`, `MINT_ON_PUBLISH_ENABLED=true`. Worker:
`CONTRACT_ADDRESS=0x8b1B…0253`, `DEPLOYMENT_BLOCK=5848830`. Conservados el volumen GCS de imágenes y
el resto de secretos.

**Asistente MCP.** El servicio `hotel-mcp-mcp` seguía apuntando al contrato original `0xf8b1…25f4`
(bloque 5655378), de modo que el asistente podía leer noches/publicaciones de cadenas anteriores. Se
alineó a `CONTRACT_ADDRESS=0x8b1B…0253` y `DEPLOYMENT_BLOCK=5848830` (revisión
`hotel-mcp-mcp-00027-cfv`, 100 %); `/health` **ok** y las herramientas de disponibilidad devuelven
`[]` y `exists:false` para las habitaciones antiguas.

| Comprobación | Resultado |
|---|---|
| Cadena nueva | **0 `RoomRegistered`, 0 `RoomPublished`, 0 `Mint`** desde 5848830 |
| DB | **50 DRAFT · 0 publicaciones · 0 nfts · 0 jobs · 50 fotos** |
| Web producción | `/health/ready`, `/`, `/catalogo`, `/api/public/rooms` → 200; `{"rooms":[]}` |
| Worker | `/health` **ok**, `lag 0` |

**Incidencia y prevención.** La revisión antigua del worker (`00043-koz`, v88) siguió viva hasta las
15:27 y publicó habitaciones con el contrato anterior (215/216/219/220). Se eliminó dicha revisión, se
repitió la limpieza completa y se promovió v89. Regla operativa: **al promover un worker, eliminar la
revisión anterior** para que ninguna instancia antigua procese jobs.

Evidencia: [`evidencias/reset-publicaciones-contrato-nuevo-v2-2026-10-22.json`](./evidencias/reset-publicaciones-contrato-nuevo-v2-2026-10-22.json).
