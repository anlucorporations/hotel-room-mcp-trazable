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
- **Deuda detectada**: `pnpm-lock.yaml` está desincronizado con algún
  `package.json` (`ERR_PNPM_OUTDATED_LOCKFILE`), así que la imagen instala con
  `--no-frozen-lockfile`. Regenerar el lockfile y volver a congelarlo.
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
| P-1 | **Regenerar `pnpm-lock.yaml`** y volver a `--frozen-lockfile` en la imagen (deuda previa del repo). |
| P-2 | El placeholder `hotel-mcp-health` puede retirarse. |
| P-3 | `worker` y `mcp` son públicos para que la web pueda llamarlos (la app no implementa *ID tokens* de servicio a servicio). En producción conviene un LB interno o auth explícita. |
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

*Despliegue GCP · hotelMCP · 2026-09-25*
