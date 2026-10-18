#!/usr/bin/env bash
# =============================================================================
# verify-vnext-schema.sh — Gate de PostgreSQL real del ciclo F1 (decisión D11 / hueco A4).
#
# El resto de pruebas del esquema son dobles de `pg`: comprueban QUÉ SQL se envía, no que PostgreSQL
# lo acepte. Este script cierra ese hueco aplicando el script canónico contra un PostgreSQL de verdad
# (en CI, el servicio `postgres:18`):
#
#   1. `RepoTecnico/base_datos.sql` se aplica DOS veces sin error → el esquema es idempotente.
#   2. Las 12 tablas vNext existen.
#   3. Las 19 columnas de extensión y el ensanchado `rooms.operational_status VARCHAR(20)` están
#      aplicados, y `IN_INSPECTION` (13 caracteres) se puede guardar de verdad.
#   4. `UPDATE`/`DELETE` sobre `operator_audit_log` revierten por el trigger append-only.
#
# Uso: DATABASE_URL=postgresql://... bash scripts/db/verify-vnext-schema.sh
# =============================================================================
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "FALTA: el cliente 'psql' no está instalado." >&2
  exit 1
fi

: "${DATABASE_URL:?define DATABASE_URL (p. ej. postgresql://postgres:postgres@127.0.0.1:5432/hotel_test)}"

psql_db() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc --quiet "$@"
}

scalar() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc --tuples-only --no-align -c "$1"
}

echo "1/4 · Aplicando RepoTecnico/base_datos.sql dos veces (idempotencia)…"
psql_db -f RepoTecnico/base_datos.sql >/dev/null
psql_db -f RepoTecnico/base_datos.sql >/dev/null

echo "2/4 · Las 12 tablas vNext existen…"
tablas=(
  terminal_operators operator_wallets on_chain_signatures
  maintenance_area_types maintenance_areas maintenance_area_tasks maintenance_area_logs
  housekeeping_inspections operator_audit_log housekeeping_damage_charges
  supply_alerts damage_charge_guest_notifications
)
for tabla in "${tablas[@]}"; do
  if [ "$(scalar "SELECT to_regclass('public.${tabla}') IS NOT NULL")" != "t" ]; then
    echo "FALTA la tabla ${tabla}" >&2
    exit 1
  fi
done

echo "3/4 · Extensión de columnas y ensanchado de rooms.operational_status…"
# 19 columnas de extensión repartidas en maintenance_incidents, preventive_tasks, preventive_plans y rooms.
columnas=(
  "maintenance_incidents:area_id" "maintenance_incidents:reported_by_role"
  "maintenance_incidents:resolution_notes" "maintenance_incidents:damage_charge_cents"
  "maintenance_incidents:damage_charge_currency" "maintenance_incidents:damage_charge_approved_by"
  "maintenance_incidents:block_signature_id" "maintenance_incidents:unblock_signature_id"
  "preventive_tasks:verified_by" "preventive_tasks:verified_at"
  "preventive_tasks:requires_signature" "preventive_tasks:signature_id"
  "preventive_tasks:evidence_path" "preventive_tasks:validation_status"
  "preventive_plans:area_id" "rooms:maintenance_blocked_until"
  "rooms:maintenance_blocked_reason" "rooms:last_inspection_at" "rooms:last_inspection_result"
)
for par in "${columnas[@]}"; do
  tabla="${par%%:*}"; columna="${par##*:}"
  if [ "$(scalar "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='${tabla}' AND column_name='${columna}'")" != "1" ]; then
    echo "FALTA la columna ${tabla}.${columna}" >&2
    exit 1
  fi
done

# El estado que motivó el ensanchado: `IN_INSPECTION` mide 13 y la columna era VARCHAR(12).
ancho="$(scalar "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name='rooms' AND column_name='operational_status'")"
if [ "${ancho}" != "20" ]; then
  echo "rooms.operational_status debería ser VARCHAR(20), es VARCHAR(${ancho})" >&2
  exit 1
fi

psql_db -c "INSERT INTO rooms (room_number, room_type, capacity, beds) VALUES (999999, 'SIMPLE', 1, 1) ON CONFLICT (room_number) DO NOTHING" >/dev/null
psql_db -c "UPDATE rooms SET operational_status = 'IN_INSPECTION' WHERE room_number = 999999" >/dev/null
if [ "$(scalar "SELECT operational_status FROM rooms WHERE room_number = 999999")" != "IN_INSPECTION" ]; then
  echo "No se pudo guardar rooms.operational_status = 'IN_INSPECTION'" >&2
  exit 1
fi
psql_db -c "DELETE FROM rooms WHERE room_number = 999999" >/dev/null

echo "4/4 · operator_audit_log es append-only (UPDATE y DELETE revierten)…"
psql_db -c "INSERT INTO operator_audit_log (actor_username, actor_role, entity_type, action, integrity_hash) VALUES ('ci-verify', 'DEFAULT_ADMIN_ROLE', 'CONFIG', 'VERIFY', '0x00')" >/dev/null

if psql_db -c "UPDATE operator_audit_log SET action = 'TAMPERED' WHERE actor_username = 'ci-verify'" >/dev/null 2>&1; then
  echo "El trigger append-only NO impidió un UPDATE" >&2
  exit 1
fi
if psql_db -c "DELETE FROM operator_audit_log WHERE actor_username = 'ci-verify'" >/dev/null 2>&1; then
  echo "El trigger append-only NO impidió un DELETE" >&2
  exit 1
fi

echo "OK · esquema vNext verificado contra PostgreSQL real."
