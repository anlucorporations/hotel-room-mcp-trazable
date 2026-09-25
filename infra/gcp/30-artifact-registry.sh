#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 30 — Artifact Registry
#
# Crea el repositorio Docker donde se publican las imágenes del monorepo
# (web, worker, mcp, monitor). Las imágenes quedan en:
#   europe-west1-docker.pkg.dev/<PROJECT_ID>/<REPO>/<imagen>:<tag>
#
# Idempotente.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

if gcloud artifacts repositories describe "$GCP_AR_REPO" \
     --location="$GCP_REGION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "==> El repositorio $GCP_AR_REPO ya existe."
else
  echo "==> Creando repositorio Docker $GCP_AR_REPO en $GCP_REGION..."
  gcloud artifacts repositories create "$GCP_AR_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --description="Imagenes Docker de hotelMCP (web, worker, mcp, monitor)" \
    --project="$GCP_PROJECT_ID"
fi

cat <<EOF

==> Configura el helper de Docker una sola vez:
    gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev

==> Publicar una imagen:
    docker tag <local> ${GCP_AR_HOST}/${GCP_PROJECT_ID}/${GCP_AR_REPO}/web:latest
    docker push ${GCP_AR_HOST}/${GCP_PROJECT_ID}/${GCP_AR_REPO}/web:latest
EOF
