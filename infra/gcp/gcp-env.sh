#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Variables comunes de la infraestructura GCP de hotelMCP.
# Uso:  source infra/gcp/gcp-env.sh
# Todos los valores se pueden sobrescribir exportándolos antes del source.
# ---------------------------------------------------------------------------
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-hotel-mcp}"
export GCP_PROJECT_NAME="${GCP_PROJECT_NAME:-hotelMCP}"
export GCP_PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-475955050238}"
export GCP_ORG_ID="${GCP_ORG_ID:-253767381125}"
export GCP_FOLDER_ID="${GCP_FOLDER_ID:-583743482796}"          # carpeta Development
export GCP_BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-013B00-B9A67C-014A43}"
export GCP_REGION="${GCP_REGION:-europe-west1}"

# Artifact Registry
export GCP_AR_REPO="${GCP_AR_REPO:-hotel-mcp}"
export GCP_AR_HOST="${GCP_REGION}-docker.pkg.dev"

# Cloud SQL
export GCP_SQL_INSTANCE="${GCP_SQL_INSTANCE:-hotel-mcp-pg}"
export GCP_SQL_DATABASE="${GCP_SQL_DATABASE:-hotel_nft}"
export GCP_SQL_USER="${GCP_SQL_USER:-hotel_admin}"

# Cuentas de servicio
export GCP_CI_SA="${GCP_CI_SA:-ci-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
export GCP_RUN_SA="${GCP_RUN_SA:-hotel-mcp-run@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"

# Workload Identity Federation (sin claves JSON: la org las prohíbe)
export GCP_WIF_GITHUB_PROVIDER="projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
export GCP_WIF_GITLAB_PROVIDER="projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/gitlab-pool/providers/gitlab-provider"
export GCP_GITHUB_REPO="${GCP_GITHUB_REPO:-anlucorporations/hotel-room-mcp-trazable}"
export GCP_GITLAB_PROJECT_PATH="${GCP_GITLAB_PROJECT_PATH:-anlucorporations/hotel-room-mcp-trazable}"
export GCP_GITLAB_ISSUER="${GCP_GITLAB_ISSUER:-https://gitlab.codecrypto.academy}"

# Secret Manager
export GCP_SECRET_DB_PASSWORD="${GCP_SECRET_DB_PASSWORD:-hotel-db-password}"

# Ruta local (fuera del repositorio) con secretos generados
export GCP_LOCAL_SECRETS_DIR="${GCP_LOCAL_SECRETS_DIR:-$HOME/.config/hotel-mcp}"

# ---------------------------------------------------------------------------
# Servicios globales (compartidos por todos los componentes desplegados)
# ---------------------------------------------------------------------------
# Anvil global ya existente en el proyecto mcc-ecommerce (Cloud Run, público,
# estado persistido en el bucket mcc-ecommerce-anvil-state vía GCS Fuse).
# OJO: su chainId es 31337, no el 81234 canónico del proyecto.
# URL pública de la web (metadata Open Graph/Twitter). Se inyecta en el BUILD de la imagen.
export GCP_WEB_URL="${GCP_WEB_URL:-https://hotel-mcp-web-475955050238.europe-west1.run.app}"

export GCP_ANVIL_URL="${GCP_ANVIL_URL:-https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app}"
export GCP_ANVIL_CHAIN_ID="${GCP_ANVIL_CHAIN_ID:-31337}"
export GCP_ANVIL_PROJECT="${GCP_ANVIL_PROJECT:-mcc-ecommerce}"

# Redis global: VM privada en la VPC dedicada (sin IP pública).
export GCP_REDIS_HOST="${GCP_REDIS_HOST:-10.10.0.10}"
export GCP_REDIS_VM="${GCP_REDIS_VM:-hotel-mcp-redis}"

# Registro de despliegue de contratos (lo consume 70-deploy-apps.sh)
export GCP_DEPLOYMENT_FILE="${GCP_DEPLOYMENT_FILE:-$PWD/packages/shared/deployments/${GCP_ANVIL_CHAIN_ID}.json}"
