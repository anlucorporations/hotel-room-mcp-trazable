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

### Pendiente tras el corte

- **Publicar las 50 fichas** (están `DRAFT`): requieren descripción ES definitiva e imagen; al
  publicar se anclan (`publishRoom`) y el **primer acuñado de la ventana** se dispara (D-4).
- **SMTP real** para cerrar `emailDegraded`.
- **Barrido global** de la ventana de acuñación y correo de agotamiento (parte 4, alcance diferido).

---

*Despliegue GCP · hotelMCP · actualizado 2026-09-27 (corte de contrato F8 ejecutado)*
