#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 50 — Secret Manager
#
# Sube a Secret Manager los secretos que la aplicación exige (ver
# RepoTecnico/entornos_globales.md §3.4) más la contraseña de Cloud SQL.
#
# Reglas:
#   - Los valores se generan con openssl, nunca viven en el repositorio.
#   - Si el secreto ya existe NO se rota (idempotente y no destructivo).
#     Para rotar:  gcloud secrets versions add <nombre> --data-file=-
#
# La contraseña de Cloud SQL se genera en el script 40 y se lee desde
# $GCP_LOCAL_SECRETS_DIR/db-password.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

PROJECT="$GCP_PROJECT_ID"
SECRETS_DIR="$GCP_LOCAL_SECRETS_DIR"
mkdir -p "$SECRETS_DIR"; chmod 700 "$SECRETS_DIR"

# Añade una versión a un secreto (creándolo si no existe).
put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    echo "    ya existe (no se rota): $name"
  else
    gcloud secrets create "$name" --project="$PROJECT" \
      --replication-policy=automatic \
      --labels=app=hotel-mcp >/dev/null
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project="$PROJECT" --data-file=- >/dev/null
    echo "    creado: $name"
  fi
}

gen() { openssl rand -base64 32 | tr -d '\n'; }

echo "==> Contraseña de Cloud SQL"
DB_PW_FILE="$SECRETS_DIR/db-password"
if [ -f "$DB_PW_FILE" ]; then
  put_secret "$GCP_SECRET_DB_PASSWORD" "$(cat "$DB_PW_FILE")"
else
  echo "    AVISO: no existe $DB_PW_FILE — ejecuta antes infra/gcp/40-cloud-sql.sh"
fi

echo "==> Secretos de aplicación"
# Nombres alineados con el inventario de variables de entorno del proyecto.
# El prefijo 'hotel-' se elimina al montar el secreto como variable de entorno.
put_secret "hotel-session-secret"         "$(gen)"
put_secret "hotel-jwt-secret"             "$(gen)"
put_secret "hotel-ticket-signing-secret"  "$(gen)"
put_secret "hotel-checkin-secret-key"     "$(gen)"
put_secret "hotel-aes-secret-key"         "$(gen)"

echo "==> Enlaces de acceso para las cuentas de servicio"
for sa in "$GCP_CI_SA" "$GCP_RUN_SA"; do
  for name in "$GCP_SECRET_DB_PASSWORD" hotel-session-secret hotel-jwt-secret \
              hotel-ticket-signing-secret hotel-checkin-secret-key hotel-aes-secret-key; do
    gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT" \
      --member="serviceAccount:$sa" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  done
  echo "    secretAccessor -> $sa"
done

echo "==> Secretos en $PROJECT:"
gcloud secrets list --project="$PROJECT" --format="table(name,createTime)"
