#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 40 — Cloud SQL (PostgreSQL, IP privada)
#
# La organización aplica constraints/sql.restrictPublicIp, por lo que la
# instancia se crea SIN IP pública y se conecta por Private Service Access
# dentro de la VPC dedicada hotel-mcp-vpc.
#
# Requisitos previos (los crea este mismo script si faltan):
#   - VPC hotel-mcp-vpc + subred hotel-mcp-euw1
#   - rango reservado hotel-mcp-psa + peering con servicenetworking
#
# La contraseña del usuario se genera una sola vez en
# $GCP_LOCAL_SECRETS_DIR/db-password (fuera del repositorio, permisos 600)
# y se sube a Secret Manager en el script 50.
#
# Idempotente.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

PROJECT="$GCP_PROJECT_ID"
NETWORK="hotel-mcp-vpc"
SUBNET="hotel-mcp-euw1"
PSA_RANGE="hotel-mcp-psa"
VERSION="${GCP_SQL_VERSION:-POSTGRES_16}"

echo "==> VPC"
if ! gcloud compute networks describe "$NETWORK" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks create "$NETWORK" --subnet-mode=custom \
    --description="VPC dedicada hotelMCP" --project="$PROJECT"
fi
if ! gcloud compute networks subnets describe "$SUBNET" \
       --region="$GCP_REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNET" \
    --network="$NETWORK" --region="$GCP_REGION" --range=10.10.0.0/24 \
    --enable-private-ip-google-access --project="$PROJECT"
fi

echo "==> Private Service Access"
if ! gcloud compute addresses describe "$PSA_RANGE" \
       --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "$PSA_RANGE" --global \
    --purpose=VPC_PEERING --prefix-length=16 --network="$NETWORK" \
    --description="Rango para Private Service Access (Cloud SQL)" \
    --project="$PROJECT"
fi
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com --ranges="$PSA_RANGE" \
  --network="$NETWORK" --project="$PROJECT" >/dev/null

echo "==> Instancia Cloud SQL"
if gcloud sql instances describe "$GCP_SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1; then
  echo "    ya existe: $GCP_SQL_INSTANCE"
else
  gcloud sql instances create "$GCP_SQL_INSTANCE" \
    --project="$PROJECT" --database-version="$VERSION" \
    --tier="${GCP_SQL_TIER:-db-f1-micro}" --edition=ENTERPRISE \
    --region="$GCP_REGION" --storage-size=10 --storage-type=HDD \
    --availability-type=zonal --no-backup \
    --network="$NETWORK" --no-assign-ip \
    --maintenance-window-day=SUN --maintenance-window-hour=3
fi

echo "==> Base de datos y usuario"
if ! gcloud sql databases describe "$GCP_SQL_DATABASE" \
       --instance="$GCP_SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud sql databases create "$GCP_SQL_DATABASE" \
    --instance="$GCP_SQL_INSTANCE" --project="$PROJECT"
fi

SECRETS_DIR="$GCP_LOCAL_SECRETS_DIR"
mkdir -p "$SECRETS_DIR"; chmod 700 "$SECRETS_DIR"
PW_FILE="$SECRETS_DIR/db-password"
if [ ! -f "$PW_FILE" ]; then
  umask 077
  openssl rand -base64 24 | tr -d '/+=' | cut -c1-24 > "$PW_FILE"
  chmod 600 "$PW_FILE"
  echo "    contraseña generada en $PW_FILE"
fi
DB_PW="$(cat "$PW_FILE")"

if gcloud sql users list --instance="$GCP_SQL_INSTANCE" --project="$PROJECT" \
     --format="value(name)" | grep -qx "$GCP_SQL_USER"; then
  echo "    usuario ya existe: $GCP_SQL_USER"
  echo "    (si rotas la contraseña, ejecuta: gcloud sql users set-password ...)"
else
  gcloud sql users create "$GCP_SQL_USER" \
    --instance="$GCP_SQL_INSTANCE" --project="$PROJECT" \
    --password="$DB_PW"
fi

# La extensión pgcrypto que usa el proyecto se crea con las migraciones de la
# aplicación (o con: gcloud sql connect <instancia> --user=<usuario>), no con
# flags de la instancia.

echo "==> Hecho."
gcloud sql instances describe "$GCP_SQL_INSTANCE" --project="$PROJECT" \
  --format="yaml(state,databaseVersion,connectionName,ipAddresses)"
