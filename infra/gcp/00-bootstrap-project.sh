#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 00 — Proyecto y facturación
#
# Crea el proyecto hotel-mcp dentro de la carpeta "Development" de la
# organización y lo vincula a la cuenta de facturación.
#
# NOTA IMPORTANTE: vincular la facturación puede fallar si la cuenta ya
# alcanzó su cuota de proyectos (por defecto 5). En ese caso hay que
# desvincular un proyecto no utilizado o solicitar aumento de cuota. ESTE
# SCRIPT NO DESVINCULA NADA POR SU CUENTA.
#
# Idempotente: repetirlo no duplica recursos.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

echo "==> Proyecto destino: $GCP_PROJECT_ID ($GCP_PROJECT_NAME)"

if gcloud projects describe "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "    El proyecto ya existe."
else
  echo "    Creando proyecto en la carpeta $GCP_FOLDER_ID..."
  gcloud projects create "$GCP_PROJECT_ID" \
    --name="$GCP_PROJECT_NAME" \
    --folder="$GCP_FOLDER_ID"
fi

echo "==> Vinculando facturación ($GCP_BILLING_ACCOUNT)..."
if gcloud billing projects describe "$GCP_PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null | grep -q True; then
  echo "    La facturación ya está vinculada."
else
  gcloud billing projects link "$GCP_PROJECT_ID" \
    --billing-account="$GCP_BILLING_ACCOUNT"
fi

gcloud config set project "$GCP_PROJECT_ID" >/dev/null
gcloud config set compute/region "$GCP_REGION" >/dev/null 2>&1 || true
gcloud config set run/region "$GCP_REGION" >/dev/null 2>&1 || true

echo "==> Hecho."
gcloud projects describe "$GCP_PROJECT_ID" \
  --format="yaml(projectId,name,projectNumber,parent,lifecycleState)"
