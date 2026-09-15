#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/hotel-postgres}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-hotel_db}"
PGUSER="${PGUSER:-hotel_user}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
GCS_BUCKET="${GCS_BACKUP_BUCKET:-}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="hotel_backup_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Iniciando volcado pg_dump para ${PGDATABASE} en ${PGHOST}:${PGPORT}..."
pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" --format=plain --no-owner --no-privileges | gzip -9 > "${FILEPATH}"

echo "[INFO] Calculando Checksum SHA-256..."
sha256sum "${FILEPATH}" > "${FILEPATH}.sha256"

if [ -n "${ENCRYPTION_KEY}" ]; then
  echo "[INFO] Cifrando backup con AES-256-CBC..."
  openssl enc -aes-256-cbc -salt -in "${FILEPATH}" -out "${FILEPATH}.enc" -k "${ENCRYPTION_KEY}"
  rm "${FILEPATH}"
  FILEPATH="${FILEPATH}.enc"
  sha256sum "${FILEPATH}" > "${FILEPATH}.sha256"
fi

echo "[INFO] Backup generado exitosamente: ${FILEPATH}"

if [ -n "${GCS_BUCKET}" ]; then
  echo "[INFO] Sincronizando con Google Cloud Storage (${GCS_BUCKET})..."
  gsutil cp "${FILEPATH}" "${GCS_BUCKET}/"
  gsutil cp "${FILEPATH}.sha256" "${GCS_BUCKET}/"
fi

echo "[INFO] Purgando backups locales más antiguos de ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[SUCCESS] Proceso de backup concluido."
