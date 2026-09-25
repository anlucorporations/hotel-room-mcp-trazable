# Infraestructura GCP — hotelMCP

Infraestructura como código (scripts `gcloud` idempotentes) del proyecto GCP
**hotelMCP** (`hotel-mcp`), creado en la carpeta *Development* de la
organización `anlucorporations-org`.

> Estado: **preparado, desplegado y verificado** el 2026-09-25. Detalle completo en
> [`RepoTecnico/infraestructura_gcp.md`](../../RepoTecnico/infraestructura_gcp.md)
> (proyecto base) y [`RepoTecnico/despliegue_gcp.md`](../../RepoTecnico/despliegue_gcp.md)
> (aplicaciones, servicios globales de Anvil/PostgreSQL/Redis y siembra).

## Puesta en marcha

```bash
bash infra/gcp/bootstrap.sh          # proyecto + APIs + IAM/WIF + Cloud SQL + secretos
bash infra/gcp/70-deploy-apps.sh     # despliega web, worker y mcp en Cloud Run
```

Las imágenes se construyen con Cloud Build
([`infra/docker/cloudbuild.yaml`](../docker/cloudbuild.yaml)); ver el
[`Dockerfile`](../../Dockerfile) de la raíz.

## Recursos

| Recurso | Identificador |
|---|---|
| Proyecto | `hotel-mcp` (nombre visible `hotelMCP`, nº `475955050238`) |
| Carpeta | `Development` (`583743482796`) |
| Región | `europe-west1` |
| Artifact Registry | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp` (Docker) |
| Cloud SQL | `hotel-mcp-pg` — PostgreSQL 18, IP privada, base `hotel_nft`, usuario `hotel_admin` |
| VPC | `hotel-mcp-vpc` + subred `hotel-mcp-euw1` (10.10.0.0/24) + Private Service Access |
| Cloud Run (runtime) | `hotel-mcp-run@hotel-mcp.iam.gserviceaccount.com` |
| CI/CD | `ci-deployer@hotel-mcp.iam.gserviceaccount.com` |
| Secret Manager | `hotel-db-password`, `hotel-session-secret`, `hotel-jwt-secret`, `hotel-ticket-signing-secret`, `hotel-checkin-secret-key`, `hotel-aes-secret-key` |
| Workload Identity | pool `github-pool` (provider `github-provider`), pool `gitlab-pool` (provider `gitlab-provider`) |

## Uso

```bash
# Todo de una vez
bash infra/gcp/bootstrap.sh

# O paso a paso
source infra/gcp/gcp-env.sh
bash infra/gcp/00-bootstrap-project.sh
bash infra/gcp/10-enable-apis.sh
bash infra/gcp/20-iam-and-wif.sh
bash infra/gcp/30-artifact-registry.sh
bash infra/gcp/40-cloud-sql.sh
bash infra/gcp/50-secrets.sh
bash infra/gcp/60-cloud-run.sh
```

Todos los scripts son idempotentes: repetirlos no duplica recursos ni rota
secretos.

## Autenticación de CI sin claves

La organización aplica `constraints/iam.disableServiceAccountKeyCreation`, por
lo que **no existen claves JSON**. La CI se autentica por Workload Identity
Federation.

### GitHub Actions

```yaml
permissions:
  contents: read
  id-token: write          # imprescindible para pedir el token OIDC

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/475955050238/locations/global/workloadIdentityPools/github-pool/providers/github-provider
          service_account: ci-deployer@hotel-mcp.iam.gserviceaccount.com
```

### GitLab CI (autoalojado `gitlab.codecrypto.academy`)

```yaml
deploy:
  id_tokens:
    GCP_ID_TOKEN:
      aud: https://iam.googleapis.com/projects/475955050238/locations/global/workloadIdentityPools/gitlab-pool/providers/gitlab-provider
  script:
    - echo "$GCP_ID_TOKEN" > /tmp/token
    - gcloud iam workload-identity-pools create-cred-config \
        projects/475955050238/locations/global/workloadIdentityPools/gitlab-pool/providers/gitlab-provider \
        --service-account=ci-deployer@hotel-mcp.iam.gserviceaccount.com \
        --output-file=/tmp/creds.json \
        --credential-source-file=/tmp/token
    - export GOOGLE_APPLICATION_CREDENTIALS=/tmp/creds.json
    - gcloud auth login --cred-file=/tmp/token   # o usa la librería ADC
```

## Publicar y desplegar una imagen

```bash
gcloud auth configure-docker europe-west1-docker.pkg.dev
docker tag hotel-web:local europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:$(git rev-parse --short HEAD)
docker push europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:$(git rev-parse --short HEAD)
```

## Seguridad y coste

- **Sin claves JSON.** Prohibidas por política; la federación OIDC es el único
  camino soportado.
- **Cloud SQL sin IP pública** (`constraints/sql.restrictPublicIp`): se accede
  por Private Service Access desde la VPC.
- **Secretos**: se generan con `openssl` y viven solo en Secret Manager. La
  contraseña de la base se guarda una vez en `~/.config/hotel-mcp/db-password`
  (permisos `600`, fuera del repositorio).
- **Coste**: Cloud SQL `db-f1-micro` zonal + disco HDD 10 GB + Cloud Run
  `min-instances=0`. Es la configuración más económica; revisar la facturación
  del proyecto antes de dejarlo en marcha indefinidamente.
- El servicio Cloud Run `hotel-mcp-health` es un **placeholder** (imagen
  pública `hello`) para validar la plataforma; se sustituye por la imagen real
  de `apps/web`.
