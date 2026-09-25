# Infraestructura GCP — hotelMCP

> **Proyecto**: `hotel-room-mcp-trazable` · **Fecha**: 2026-09-25
> **Estado**: proyecto GCP creado y preparado (base + CI sin claves + recursos de despliegue)
> **IaC**: [`infra/gcp/`](../infra/gcp/) · **Bloqueante que resuelve**: B-8

---

## 1. Resumen

Se ha creado y preparado el proyecto de Google Cloud **hotelMCP** para alojar
los entornos desplegados del sistema, con autenticación de CI **sin claves**
(Workload Identity Federation) y recursos de despliegue aprovisionados.

| Decisión | Valor | Motivo |
|---|---|---|
| Project ID | `hotel-mcp` | Los Project ID no admiten mayúsculas; `hotelMCP` es el nombre visible |
| Nº de proyecto | `475955050238` | — |
| Carpeta | `Development` (`583743482796`) | Misma organización que la cuenta de facturación |
| Organización | `anlucorporations-org` (`253767381125`) | — |
| Región | `europe-west1` | Coherente con `config_default` del workspace |
| Facturación | `013B00-B9A67C-014A43` | Cuenta existente de la organización |

### 1.1. Cambio de facturación (acción sensible ejecutada con autorización)

La cuenta de facturación tenía su cuota completa (5 proyectos). Con
autorización explícita del responsable se **desvinculó** el proyecto
`quantum-feat-503600-q6` (*My Project 34205*, creado el 2026-07-26, sin uso
conocido) y se vinculó `hotel-mcp`. Para revertirlo:

```bash
gcloud billing projects unlink hotel-mcp
gcloud billing projects link quantum-feat-503600-q6 --billing-account=013B00-B9A67C-014A43
```

---

## 2. Inventario de recursos

| Recurso | Identificador / valor |
|---|---|
| Proyecto | `hotel-mcp` (nº `475955050238`, nombre `hotelMCP`) |
| APIs habilitadas | Resource Manager, Service Usage, IAM, IAM Credentials, Billing, Cloud SQL Admin, Logging, Monitoring, Service Networking, STS, Artifact Registry, Cloud Run, Cloud Build, Secret Manager, VPC Access, Compute |
| Artifact Registry | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp` (Docker, STANDARD) |
| VPC | `hotel-mcp-vpc` (custom) |
| Subred | `hotel-mcp-euw1` — `europe-west1`, `10.10.0.0/24`, Private Google Access |
| Private Service Access | rango `hotel-mcp-psa` (`/16`) peered con `servicenetworking.googleapis.com` |
| Cloud SQL | `hotel-mcp-pg` — PostgreSQL 18, `db-f1-micro`, zonal, 10 GB HDD, **sin IP pública** |
| Cloud SQL conexión | `hotel-mcp:europe-west1:hotel-mcp-pg` |
| Base de datos | `hotel_nft` · usuario `hotel_admin` |
| Cloud Run | servicio placeholder `hotel-mcp-health`, privado, `min-instances=0`, con VPC egress |
| Secret Manager | 6 secretos (ver §6) |
| Cuenta CI | `ci-deployer@hotel-mcp.iam.gserviceaccount.com` |
| Cuenta runtime | `hotel-mcp-run@hotel-mcp.iam.gserviceaccount.com` |

---

## 3. Cuentas de servicio y roles

### 3.1. `ci-deployer` — pipelines CI/CD

| Rol | Para |
|---|---|
| `roles/artifactregistry.writer` | publicar imágenes |
| `roles/run.admin` | desplegar/actualizar servicios Cloud Run |
| `roles/cloudsql.client` | conectar con la base |
| `roles/iam.serviceAccountUser` | actuar como la cuenta de runtime al desplegar |
| `roles/secretmanager.secretAccessor` | leer secretos en el despliegue |
| `roles/logging.logWriter` | escribir logs |
| `roles/monitoring.metricWriter` | publicar métricas |

### 3.2. `hotel-mcp-run` — identidad de ejecución de Cloud Run

`roles/cloudsql.client`, `roles/secretmanager.secretAccessor`,
`roles/logging.logWriter`, `roles/monitoring.metricWriter`.

**Principio de mínimo privilegio**: la cuenta de CI no es la de runtime y
ninguna tiene roles de propietario/editor.

---

## 4. CI/CD sin claves (Workload Identity Federation)

La organización aplica la política **`constraints/iam.disableServiceAccountKeyCreation`**:
`gcloud iam service-accounts keys create` devuelve
`FAILED_PRECONDITION: Key creation is not allowed on this service account`.
Por tanto **no se generó ninguna clave JSON** — es además la práctica
recomendada. La CI obtiene credenciales efímeras por OIDC.

| Pool | Provider | Issuer | Condición |
|---|---|---|---|
| `github-pool` | `github-provider` | `https://token.actions.githubusercontent.com` | `assertion.repository == 'anlucorporations/hotel-room-mcp-trazable'` |
| `gitlab-pool` | `gitlab-provider` | `https://gitlab.codecrypto.academy` | `assertion.project_path == 'anlucorporations/hotel-room-mcp-trazable'` |

Ambos quedan enlazados a `ci-deployer` con `roles/iam.workloadIdentityUser`.

**GitHub Actions**

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/475955050238/locations/global/workloadIdentityPools/github-pool/providers/github-provider
      service_account: ci-deployer@hotel-mcp.iam.gserviceaccount.com
```

**GitLab CI** — el runner pide un `id_token` con `aud` igual al nombre completo
del provider, lo escribe en un fichero y genera una credencial con
`gcloud iam workload-identity-pools create-cred-config`. Detalle en
[`infra/gcp/README.md`](../infra/gcp/README.md).

---

## 5. Red y Cloud SQL (IP privada)

La organización aplica **`constraints/sql.restrictPublicIp`**: el primer intento
de crear la instancia con IP pública falló con
`Organization Policy check failure: the external IP of this instance violates
the constraints/sql.restrictPublicIp`. La instancia se creó por tanto con
`--no-assign-ip` sobre `hotel-mcp-vpc` mediante Private Service Access.

Consecuencia para la aplicación: Cloud Run llega a la base con **egress VPC**
(`--network=hotel-mcp-vpc --subnet=hotel-mcp-euw1 --vpc-egress=private-ranges-only`)
y/o el **Cloud SQL Connector** (`--add-cloudsql-instances`). Cualquier acceso
desde fuera de la VPC requiere el proxy/connector (no hay IP pública).

---

## 6. Secretos (Secret Manager)

Valores generados con `openssl rand`, nunca versionados. Los nombres se
alinean con el inventario de variables de `entornos_globales.md` §3.4.

| Secreto | Variable de la app |
|---|---|
| `hotel-db-password` | contraseña de `hotel_admin` (Cloud SQL) |
| `hotel-session-secret` | `SESSION_SECRET` |
| `hotel-jwt-secret` | `JWT_SECRET` |
| `hotel-ticket-signing-secret` | `TICKET_SIGNING_SECRET` |
| `hotel-checkin-secret-key` | `CHECKIN_SECRET_KEY` |
| `hotel-aes-secret-key` | `AES_SECRET_KEY` |

La contraseña de la base se guarda además una sola vez en
`~/.config/hotel-mcp/db-password` (permisos `600`, **fuera del repositorio**).

> Los valores **no se muestran en este documento** (trazabilidad sin filtrar
> secretos). Para consultarlos: `gcloud secrets versions access latest --secret=<nombre>`.

---

## 7. Artifact Registry y Cloud Run

- **Artifact Registry** (`hotel-mcp`, Docker): destino de las imágenes
  `web`, `worker`, `mcp` y `monitor`.
- **Cloud Run**: desplegado un **placeholder** `hotel-mcp-health` con la imagen
  pública `us-docker.pkg.dev/cloudrun/container/hello`, privado (sin acceso no
  autenticado), `min-instances=0`, `max-instances=2`, ejecutando como
  `hotel-mcp-run` y con egress a la VPC. Sirve para validar plataforma, IAM y
  red; se sustituye por la imagen real de `apps/web`.

---

## 8. Políticas de organización encontradas

| Política | Efecto en este proyecto |
|---|---|
| `constraints/iam.disableServiceAccountKeyCreation` | sin claves JSON; la CI usa WIF |
| `constraints/sql.restrictPublicIp` | Cloud SQL solo con IP privada + VPC/PSA |

Ambas son restrictivas y correctas desde seguridad; condicionan el diseño del
despliegue y quedan documentadas para que no se redescubran como fallo.

---

## 9. Pendientes y riesgos

| # | Pendiente | Detalle |
|---|---|---|
| P-1 | **Dockerfiles** | El repositorio no tiene ningún `Dockerfile`; hay que crearlos para `web`/`worker`/`mcp`/`monitor` antes de publicar imágenes. |
| P-2 | Job de despliegue en CI | Ni `.github/workflows/ci.yml` ni `.gitlab-ci.yml` despliegan a GCP todavía; solo prueban. Falta el job `deploy` con la autenticación WIF documentada. |
| P-3 | Sustituir el placeholder | Retirar `hotel-mcp-health` cuando exista la imagen real. |
| P-4 | Migraciones y `pgcrypto` | La extensión `pgcrypto` la crean las migraciones de la aplicación, no la instancia. |
| P-5 | Coste | Revisar facturación: Cloud SQL encendido 24/7. Apagarlo si no se usa (`gcloud sql instances patch hotel-mcp-pg --activation-policy=NEVER`). |
| P-6 | Rotación de secretos | Los secretos se crearon una vez; definir política de rotación antes de producción. |
| P-7 | `db-f1-micro` / zonal / sin backups | Configuración de desarrollo; **no apta para producción** (sin HA, sin backups automáticos). |

---

## 10. Reproducción

```bash
bash infra/gcp/bootstrap.sh     # idempotente
```

Variables en [`infra/gcp/gcp-env.sh`](../infra/gcp/gcp-env.sh). Todo el estado
se puede reconstruir salvo los valores de los secretos, que deben rotarse si
se recrea el proyecto.

---

## 11. Relación con el bloqueante B-8

B-8 (*«Credenciales de GCP, si se quiere un entorno de preview desplegado»*)
queda **resuelto**: el proyecto existe, hay identidad de CI sin claves y los
recursos de despliegue están aprovisionados. Lo que resta (P-1, P-2, P-3) es
trabajo de construcción del pipeline, no una dependencia externa.

---

*Infraestructura GCP · hotelMCP · 2026-09-25*
