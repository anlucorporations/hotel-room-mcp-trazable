/**
 * Plan de **inicialización de la plataforma** (2026-10-05, petición del responsable).
 *
 * Objetivo: dejar la base **off-chain** limpia para arrancar el recorrido de casos de uso desde cero,
 * **sin** tocar los servicios globales (Anvil/Foundry y Cloud SQL).
 *
 * Por qué un módulo puro y no solo un script: el orden de borrado es lo único que puede hacer daño
 * (una tabla referenciada con `ON DELETE RESTRICT` bloquea el borrado; una con `SET NULL` se
 * conserva). Aquí se declara el plan y `reset-plan.test.ts` lo **valida contra `base_datos.sql`**:
 * cobertura completa (las 46 tablas están clasificadas) y orden correcto (ningún hijo después de su
 * padre). Si alguien añade una tabla o una FK, la prueba se pone roja antes de que nadie ejecute nada.
 *
 * **Por qué `DELETE` y no `TRUNCATE`:** `preventive_plans.room_id → rooms(id) ON DELETE SET NULL`.
 * `TRUNCATE rooms CASCADE` arrastraría `preventive_plans` (y sus tareas) porque PostgreSQL trunca
 * todas las tablas que referencian a la truncada, sin mirar la acción; es decir, **se perdería un
 * catálogo que debe conservarse**. Un borrado ordenado con `DELETE` respeta `SET NULL` y deja el plan
 * preventivo vivo con `room_id = NULL`.
 */

/**
 * Tablas que **se conservan**: operadores (para poder entrar y recorrer los casos de uso) y los
 * catálogos/semillas sin los que la aplicación no puede funcionar (tipos de habitación, servicios,
 * espacios, artículos de lencería, planes preventivos y ajustes de plataforma).
 */
export const PRESERVED_TABLES = [
  "admin_users",
  "mfa_recovery_codes",
  "room_types",
  "room_amenities",
  "room_space_types",
  "room_cleaning_checklist_items",
  "supply_items",
  "preventive_plans",
  "platform_settings",
] as const;

/**
 * Tablas de **estado del worker**: no se borran, se **reescriben** (no forman parte de `WIPE_ORDER`).
 *
 * `worker_checkpoints` y `worker_aggregate_counters.last_block` se fijan a la **cabeza actual** de la
 * cadena para que el worker no reindexe el pasado. Si se dejaran a 0 (o se borraran), el worker
 * rebobinaría al bloque de despliegue y **repoblaría** la base con las noches y ventas antiguas.
 */
export const CHECKPOINT_TABLES = ["worker_checkpoints", "worker_aggregate_counters"] as const;

/**
 * Orden de borrado: **hijos antes que padres**. Se deriva de las claves foráneas de `base_datos.sql`
 * (la prueba lo comprueba). `rooms` va al final para que `preventive_plans.room_id` quede a `NULL` en
 * vez de perderse.
 */
export const WIPE_ORDER = [
  // — derivados de checkout y cargos —
  "checkout_incidents",
  "activity_bookings",
  "additional_charges",
  "stay_checkouts",
  // — reservas y sus derivados —
  "reservation_nights",
  "reservation_contacts",
  "reservation_status_history",
  "folios",
  "supply_stock_movements",
  "reservations",
  // — actividades —
  "activity_schedules",
  "activities",
  // — housekeeping —
  "room_cleaning_checklists",
  "housekeeping_room_logs",
  "housekeeping_assignments",
  "housekeeping_shifts",
  // — mantenimiento (se conservan los planes, no las tareas ni las incidencias) —
  "maintenance_incident_events",
  "maintenance_incidents",
  "preventive_tasks",
  // — índice de cadena y sus derivados —
  "listings",
  "sale_events",
  "checkin_contingency_logs",
  "reviews",
  "nfts",
  // — ficha de habitación —
  "room_images",
  "room_amenity_links",
  "room_spaces",
  "room_publications",
  "room_status_history",
  // — habitaciones (al final: los planes preventivos quedan con room_id = NULL) —
  "rooms",
  // — contenido de la web —
  "hotel_offers",
  "hotel_images",
  // — avisos, sesiones y estado del worker —
  "email_notifications",
  "push_subscriptions",
  "admin_sessions",
  "worker_sale_history",
  "worker_processed_logs",
] as const;

/** Sentencias de borrado en orden seguro. */
export function buildDeleteStatements(): string[] {
  return WIPE_ORDER.map((table) => `DELETE FROM ${table}`);
}
