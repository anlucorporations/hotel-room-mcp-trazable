-- ============================================================================
-- base_datos.sql — Esquema físico canónico de «Hotel Marina del Sol»
-- ============================================================================
-- Propósito : reproducir en PostgreSQL el esquema que la aplicación aplica en
--             runtime (packages/shared/src/db/migrator.ts, constante
--             INITIAL_SCHEMA_SQL). Es el artefacto de referencia para levantar
--             la base desde cero y para revisarla con psql, y se mantiene
--             sincronizado con:
--               · RepoTecnico/diagrama_er.md        (modelo entidad-relación)
--               · RepoTecnico/diccionario_datos.md  (diccionario de datos)
--
-- Versión   : 1.3.0
-- Fecha     : 2026-09-26
-- Motor     : PostgreSQL 14+ (requiere la extensión pgcrypto)
-- Uso       : psql -f RepoTecnico/base_datos.sql
--
-- Changelog
--   1.3.0 (2026-09-26) · Se añade la sección 3.7 «contenido público» (bloque 5,
--     decisiones D-73/D-74): hotel_images (galería de la home) y hotel_offers
--     (planes informativos). Sincronizado con packages/shared/src/db/migrator.ts.
--     Total del esquema: 44 tablas.
--   1.2.0 (2026-09-26) · Se añade la sección 3.6 «reservas, actividades,
--     housekeeping y mantenimiento» (bloque 2, decisiones D-34…D-55): 17 tablas
--     (reservations, reservation_nights, reservation_contacts,
--     reservation_status_history, folios, activities, activity_schedules,
--     activity_bookings, housekeeping_shifts, housekeeping_assignments,
--     housekeeping_room_logs, supply_items, supply_stock_movements,
--     maintenance_incidents, maintenance_incident_events, preventive_plans,
--     preventive_tasks) + columna adicional_charges.folio_id. Sincronizado con
--     packages/shared/src/db/migrator.ts. Total del esquema: 42 tablas.
--   1.1.0 (2026-09-26) · Se añade la sección 3.5 «habitaciones y reseñas» de la
--     Suite Administración → Habitación (decisiones D-1…D-28): room_types, rooms,
--     room_images, room_amenities, room_amenity_links, room_publications,
--     room_status_history, reviews y platform_settings. SINCRONIZADO con el
--     runtime: las 9 tablas, sus índices y sus semillas están ya en
--     packages/shared/src/db/migrator.ts (INITIAL_SCHEMA_SQL). Total del
--     esquema: 25 tablas (16 + 9).
--   1.0.0 (2026-09-26) · Primera versión del artefacto. Cubre las 16 tablas del
--     migrator: nfts (incluidas las columnas incrementales on_chain_anchored y
--     recovery_code), listings, sale_events, admin_sessions, admin_users,
--     mfa_recovery_codes, email_notifications, push_subscriptions,
--     checkin_contingency_logs, additional_charges, stay_checkouts,
--     checkout_incidents, worker_checkpoints, worker_processed_logs,
--     worker_aggregate_counters y worker_sale_history. Idempotente y
--     reejecutable.
--
-- Convenciones
--   · Identificadores en snake_case; tablas en plural; PK llamada «id».
--   · FK llamada «<tabla_singular>_id» (las que referencian la PK de negocio de
--     nfts conservan el nombre token_id).
--   · Marcas de tiempo *_at en TIMESTAMP (UTC): created_at / updated_at.
--   · Importes on-chain en wei como NUMERIC(78,0); importes off-chain en
--     céntimos como BIGINT (amount_cents).
--   · Sin credenciales, secretos ni claves: este fichero es solo estructura.
--
-- Idempotencia
--   · CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   · ALTER TABLE ... ADD COLUMN IF NOT EXISTS para columnas incrementales.
--   · INSERT ... ON CONFLICT DO NOTHING para las filas semilla.
--   · COMMENT ON sobrescribe el comentario anterior: reejecutable.
-- ============================================================================

-- ============================================================================
-- 1. Extensiones
-- ============================================================================

-- gen_random_uuid() para las PK UUID (todas las tablas off-chain).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. Tipos y enumerados
-- ============================================================================

-- NO se define ningún CREATE TYPE en este esquema (el migrator tampoco lo hace).
-- Los vocabularios cerrados se modelan como VARCHAR con CHECK o documentados en
-- comentario: nfts.status, additional_charges.status y stay_checkouts.room_condition.

-- ============================================================================
-- 3. Tablas (en orden de dependencias)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Dominio: inventario de noches y mercado secundario
-- ----------------------------------------------------------------------------

-- Inventario de noches-token. PK de negocio: token_id (uint256 en la cadena).
CREATE TABLE IF NOT EXISTS nfts (
    token_id VARCHAR(66) PRIMARY KEY,
    room_number INT NOT NULL,
    room_type VARCHAR(10) NOT NULL,
    check_in_date DATE NOT NULL,
    base_price_wei NUMERIC(78, 0) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    current_owner VARCHAR(42) NOT NULL,
    check_in_secret_enc TEXT NULL,
    minted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    checked_in_at TIMESTAMP NULL,
    burned_at TIMESTAMP NULL,
    tx_hash_mint VARCHAR(66) NOT NULL
);

-- Anclaje on-chain (D-04/RF-03): una fila solo es válida si su tx_hash_mint procede de una
-- transacción real. El minteo masivo del back-office NO emite transacciones, así que sus filas
-- se persisten marcadas como no ancladas (FALSE), con el hash centinela cero en tx_hash_mint, y
-- quedan EXCLUIDAS del catálogo público. El worker las promueve a TRUE cuando ancla el lote.
-- El DEFAULT TRUE es la opción conservadora: las filas preexistentes (escritas por el worker a
-- partir de eventos on-chain) conservan su significado y no desaparecen del catálogo.
ALTER TABLE nfts ADD COLUMN IF NOT EXISTS on_chain_anchored BOOLEAN NOT NULL DEFAULT TRUE;

-- Código de recuperación de reserva (D-32, CU-32): identificador corto y ESTABLE del token que
-- recepción teclea si el QR del huésped no está disponible. Se deriva del tokenId con
-- recoveryCodeForToken (nunca de datos personales, RNF-30).
ALTER TABLE nfts ADD COLUMN IF NOT EXISTS recovery_code VARCHAR(16) NULL;

-- Ofertas de reventa de una noche.
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id) ON DELETE CASCADE,
    seller VARCHAR(42) NOT NULL,
    price_in_wei NUMERIC(78, 0) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    listed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP NULL,
    tx_hash_list VARCHAR(66) NOT NULL
);

-- Histórico auditable de ventas (primarias y reventas) y royalties.
CREATE TABLE IF NOT EXISTS sale_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id) ON DELETE CASCADE,
    seller VARCHAR(42) NOT NULL,
    buyer VARCHAR(42) NOT NULL,
    price_in_wei NUMERIC(78, 0) NOT NULL,
    royalty_amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    is_secondary BOOLEAN NOT NULL DEFAULT FALSE,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3.2 Dominio: operadores del back-office y comunicaciones
-- ----------------------------------------------------------------------------

-- Sesiones de operador y rotación de refresh token.
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    -- Traza del acceso PSEUDONIMIZADA (ADR-24, decisión de M9): aquí ya NO va la IP ni el
    -- user agent en claro, sino un HMAC-SHA256 con clave: "hmac-sha256:" + 64 hex (77 caracteres).
    -- Nulas porque un acceso sin IP ni user agent no tiene nada que guardar.
    ip_address VARCHAR(80) NULL,
    user_agent VARCHAR(80) NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Las columnas nacieron como VARCHAR(45)/TEXT NOT NULL con el dato en claro; una base ya creada no
-- cambia de tipo por CREATE TABLE IF NOT EXISTS, así que se ajustan aquí de forma idempotente.
-- El orden importa: primero ensanchar y permitir nulos, después escribir los valores nuevos.
ALTER TABLE admin_sessions ALTER COLUMN ip_address TYPE VARCHAR(80);
ALTER TABLE admin_sessions ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE admin_sessions ALTER COLUMN user_agent TYPE VARCHAR(80);
ALTER TABLE admin_sessions ALTER COLUMN user_agent DROP NOT NULL;

-- Operadores del back-office (D-04): sistema canónico de autenticación.
-- Contraseña (bcrypt) + TOTP obligatorio. La semilla TOTP NUNCA se guarda en claro:
-- va cifrada con AES-256-GCM usando AES_SECRET_KEY (sin valor por defecto en el código).
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret_enc TEXT NOT NULL,
    role VARCHAR(30) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Códigos de rescate MFA (bcrypt del código). Sin FK: se ligan por username.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    code_hash VARCHAR(60) NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Cola persistente de correo con reintentos.
CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP NULL
);

-- Suscripciones de avisos push del navegador.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Registro de check-in asistido por contingencia (QR no disponible).
CREATE TABLE IF NOT EXISTS checkin_contingency_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id) ON DELETE CASCADE,
    room_number INT NOT NULL,
    check_in_date DATE NOT NULL,
    possession_proof_type VARCHAR(50) NOT NULL,
    possession_proof_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    pms_registered BOOLEAN NOT NULL DEFAULT TRUE,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3.3 Dominio: recepción off-chain (D-33/D-34, incremento v2)
-- ----------------------------------------------------------------------------
-- El contrato canónico NO cambia: la estancia y sus cargos son estado operativo
-- del hotel y el check-out se ancla aquí (no en la cadena). Nada de estas tablas
-- guarda datos personales (RNF-30).

-- Cargos adicionales de una estancia (minibar, late check-out, daños…).
CREATE TABLE IF NOT EXISTS additional_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id) ON DELETE CASCADE,
    concept VARCHAR(120) NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING', -- PENDING | CANCELLED | PAID
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_by VARCHAR(100) NULL,
    cancelled_at TIMESTAMP NULL,
    cancel_reason VARCHAR(200) NULL
);

-- Check-out de una estancia. UNIQUE(token_id) garantiza la idempotencia (RNF-34):
-- un segundo check-out devuelve el registro existente en lugar de duplicarlo.
CREATE TABLE IF NOT EXISTS stay_checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL UNIQUE REFERENCES nfts(token_id) ON DELETE CASCADE,
    room_number INT NOT NULL,
    check_in_date DATE NOT NULL,
    room_condition VARCHAR(20) NOT NULL, -- OK | INCIDENCIA (vocabulario cerrado)
    notes TEXT NULL,
    charges_cancelled INTEGER NOT NULL DEFAULT 0,
    processed_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Incidencias marcadas al verificar la habitación en el check-out
-- (vocabulario cerrado en el dominio).
CREATE TABLE IF NOT EXISTS checkout_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_id UUID NOT NULL REFERENCES stay_checkouts(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL,
    description VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3.4 Dominio: estado del mini-worker (D-09)
-- ----------------------------------------------------------------------------
-- Checkpoints, idempotencia, agregados e histórico viven en PostgreSQL, la MISMA
-- base que usa la web/API (una sola verdad). Importes en wei como NUMERIC(78,0):
-- cubren uint256 sin pérdida de precisión.

-- Checkpoint de sincronización por contrato.
CREATE TABLE IF NOT EXISTS worker_checkpoints (
    contract_address VARCHAR(42) PRIMARY KEY,
    last_block BIGINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotencia por log on-chain: la PK es la clave del log (txHash:logIndex para
-- los agregados, keccak256(txHash, logIndex) para el aviso por email).
CREATE TABLE IF NOT EXISTS worker_processed_logs (
    log_key VARCHAR(120) PRIMARY KEY,
    block_number BIGINT NULL,
    contract_address VARCHAR(42) NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Agregados del dashboard: una ÚNICA fila (id = 0). contract_address detecta el
-- redeploy para resetear el estado y no arrastrar datos del contrato anterior.
CREATE TABLE IF NOT EXISTS worker_aggregate_counters (
    id INTEGER PRIMARY KEY CHECK (id = 0),
    primary_volume_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    royalties_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    secondary_volume_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    sold_count INTEGER NOT NULL DEFAULT 0,
    minted_count INTEGER NOT NULL DEFAULT 0,
    burned_count INTEGER NOT NULL DEFAULT 0,
    last_block BIGINT NOT NULL DEFAULT 0,
    contract_address VARCHAR(42) NULL
);

-- Histórico de ventas: una fila por venta (PK compuesta tx_hash + log_index).
CREATE TABLE IF NOT EXISTS worker_sale_history (
    tx_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    token_id VARCHAR(66) NOT NULL,
    room INT NOT NULL,
    date_yyyymmdd INT NOT NULL,
    room_type VARCHAR(20) NOT NULL,
    price_wei NUMERIC(78, 0) NOT NULL,
    sale_type_raw INT NOT NULL,
    seller VARCHAR(42) NOT NULL,
    buyer VARCHAR(42) NOT NULL,
    block_number BIGINT NOT NULL,
    -- Marca temporal del bloque (reloj de la cadena), base de la serie mensual de D-16.
    -- NULLABLE a propósito: las filas anteriores a esta migración no tienen el dato y quedan
    -- fuera de la serie, declaradas en el contador undatedSalesCount en lugar de inventar fecha.
    block_timestamp TIMESTAMPTZ NULL,
    PRIMARY KEY (tx_hash, log_index)
);

-- Migración incremental para bases ya creadas (M7). El ORDEN importa: en PostgreSQL el
-- CREATE TABLE IF NOT EXISTS NO añade columnas a una tabla que ya existía, así que el índice
-- sobre block_timestamp (sección 4) tiene que ir DESPUÉS de este ALTER.
ALTER TABLE worker_sale_history ADD COLUMN IF NOT EXISTS block_timestamp TIMESTAMPTZ NULL;

-- ----------------------------------------------------------------------------
-- 3.5 Dominio: habitaciones y reseñas (Suite Administración → Habitación)
-- ----------------------------------------------------------------------------
-- PROPUESTA del ciclo F1 (decisiones D-1…D-28). Estas tablas todavía NO están en
-- packages/shared/src/db/migrator.ts, que es la fuente de verdad en runtime; el
-- primer paso de F1 es llevarlas allí. Sin PII de viajeros (ADR-20/RNF-30).

-- Catálogo de tipos de habitación. Fijo (D-22): SIMPLE · DOBLE · SUITE, con el
-- royalty inmutable del contrato (ADR-18) expresado en puntos básicos (bps).
CREATE TABLE IF NOT EXISTS room_types (
    code VARCHAR(10) PRIMARY KEY,           -- SIMPLE | DOBLE | SUITE
    name_es VARCHAR(40) NOT NULL,
    name_en VARCHAR(40) NOT NULL,
    name_ru VARCHAR(40) NOT NULL,
    base_capacity INT NOT NULL CHECK (base_capacity > 0),
    royalty_bps INT NOT NULL CHECK (royalty_bps BETWEEN 0 AND 10000),
    sort_order INT NOT NULL DEFAULT 0
);

-- Habitación como ente operativo (D-1, D-19, D-21). La BD es la fuente única del
-- maestro (D-3): el registro on-chain se alimentará desde aquí en el corte final.
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number INT UNIQUE NOT NULL CHECK (room_number > 0),
    floor INT NULL,
    room_type VARCHAR(10) NOT NULL REFERENCES room_types(code) ON UPDATE CASCADE,
    capacity INT NOT NULL CHECK (capacity > 0),
    beds INT NOT NULL CHECK (beds > 0),
    size_m2 NUMERIC(6, 2) NULL CHECK (size_m2 IS NULL OR size_m2 > 0),
    -- Obligatoria en español solo para PUBLICAR (D-6, D-21); EN/RU opcionales con respaldo.
    description_es TEXT NULL,
    description_en TEXT NULL,
    description_ru TEXT NULL,
    base_rate_wei NUMERIC(78, 0) NULL,
    -- Dos estados INDEPENDIENTES (D-19): publicación y operativo.
    publication_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    operational_status VARCHAR(12) NOT NULL DEFAULT 'CLEAN',
    -- Archivar, nunca borrar (D-8): NULL = vigente; con fecha = archivada.
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT rooms_publication_status_check
        CHECK (publication_status IN ('DRAFT', 'PUBLISHED', 'PAUSED', 'MAINTENANCE', 'OUT_OF_SERVICE')),
    CONSTRAINT rooms_operational_status_check
        CHECK (operational_status IN ('CLEAN', 'DIRTY', 'OCCUPIED')),
    -- Para publicar se exige descripción en español (D-21).
    CONSTRAINT rooms_publish_requires_es CHECK (
        publication_status <> 'PUBLISHED' OR description_es IS NOT NULL
    )
);

-- Galería de fotos (D-5, D-12, D-20): solo JPG, <=2 MB y máx. 5 por habitación.
-- file_name sigue <habitación>-<tipo>-<fecha de subida>-<nº de imagen>.
CREATE TABLE IF NOT EXISTS room_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    file_name VARCHAR(200) NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    position INT NOT NULL CHECK (position BETWEEN 1 AND 5),
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    alt_text_es VARCHAR(200) NULL,
    alt_text_en VARCHAR(200) NULL,
    alt_text_ru VARCHAR(200) NULL,
    mime_type VARCHAR(30) NOT NULL DEFAULT 'image/jpeg' CHECK (mime_type = 'image/jpeg'),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Catálogo de servicios/amenidades (D-21). Por habitación es opcional.
CREATE TABLE IF NOT EXISTS room_amenities (
    code VARCHAR(40) PRIMARY KEY,
    name_es VARCHAR(60) NOT NULL,
    name_en VARCHAR(60) NOT NULL,
    name_ru VARCHAR(60) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- Servicios asignados a cada habitación (N:M).
CREATE TABLE IF NOT EXISTS room_amenity_links (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    amenity_code VARCHAR(40) NOT NULL REFERENCES room_amenities(code) ON UPDATE CASCADE,
    PRIMARY KEY (room_id, amenity_code)
);

-- Publicaciones ancladas (D-2, D-18): huella del contenido + nº de habitación + fecha.
CREATE TABLE IF NOT EXISTS room_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    content_hash VARCHAR(66) NOT NULL,
    tx_hash VARCHAR(66) NULL,
    on_chain_anchored BOOLEAN NOT NULL DEFAULT FALSE,
    -- Firma EIP-191 (personal_sign) del administrador sobre la huella (D-1/D-2).
    signature TEXT NULL,
    signer_address VARCHAR(42) NULL,
    published_by VARCHAR(100) NOT NULL,
    published_at TIMESTAMP NOT NULL DEFAULT NOW(),
    unpublished_at TIMESTAMP NULL
);

-- Migración incremental (F1): las columnas de firma se añaden a bases ya creadas.
ALTER TABLE room_publications ADD COLUMN IF NOT EXISTS signature TEXT NULL;
ALTER TABLE room_publications ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42) NULL;


-- Historial de cambios de estado (publicación u operativo) para trazabilidad (D-19).
CREATE TABLE IF NOT EXISTS room_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    status_kind VARCHAR(12) NOT NULL CHECK (status_kind IN ('PUBLICATION', 'OPERATIONAL')),
    from_value VARCHAR(20) NULL,
    to_value VARCHAR(20) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    reason VARCHAR(200) NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Reseñas (D-27, D-28): anónimas y verificadas por noche consumida on-chain.
-- NUNCA se publica el número exacto de habitación: solo el tipo. room_id se guarda
-- para verificación interna y se anula si la habitación se archiva/borra.
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL UNIQUE REFERENCES nfts(token_id) ON DELETE CASCADE,
    room_type VARCHAR(10) NOT NULL REFERENCES room_types(code) ON UPDATE CASCADE,
    room_id UUID NULL REFERENCES rooms(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    moderated_by VARCHAR(100) NULL,
    moderated_at TIMESTAMP NULL
);

-- Ajustes de plataforma (D-11): ventana global de acuñado y similares.
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by VARCHAR(100) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3.6 Dominio: reservas, actividades, housekeeping y mantenimiento (bloque 2)
-- ----------------------------------------------------------------------------
-- Decisiones D-34…D-55. Sincronizado con packages/shared/src/db/migrator.ts.
-- Sin PII de viajeros salvo el contacto mínimo cifrado y purgable (D-55).

-- Reserva (D-34/D-35/D-37/D-40/D-41/D-43). La noche se retiene sin acuñar; el
-- token se emite al pagar el 100 % (D-39).
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    channel VARCHAR(12) NOT NULL DEFAULT 'COUNTER',   -- WEB | COUNTER
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING',    -- PENDING | CONFIRMED | CANCELLED | NO_SHOW | COMPLETED
    total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    deposit_required_cents BIGINT NOT NULL DEFAULT 0 CHECK (deposit_required_cents >= 0),
    deposit_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (deposit_paid_cents >= 0),
    hold_expires_at TIMESTAMP NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    cancel_reason VARCHAR(200) NULL,
    CONSTRAINT reservations_dates_check CHECK (check_out_date > check_in_date),
    CONSTRAINT reservations_status_check
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'))
);

-- Noches retenidas por la reserva. Índice único parcial (active) = sin sobreventa
-- (D-41). token_id se rellena cuando la noche se acuña al pagar el 100 % (D-39).
CREATE TABLE IF NOT EXISTS reservation_nights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    night_date DATE NOT NULL,
    token_id VARCHAR(66) NULL REFERENCES nfts(token_id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Contacto mínimo cifrado (D-55): canal + dirección, nunca nombre/DNI/teléfono.
CREATE TABLE IF NOT EXISTS reservation_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    channel VARCHAR(12) NOT NULL CHECK (channel IN ('EMAIL', 'TELEGRAM', 'WEB')),
    value_enc TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    purge_at TIMESTAMP NOT NULL,
    purged_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS reservation_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    from_value VARCHAR(12) NULL,
    to_value VARCHAR(12) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    reason VARCHAR(200) NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Folio de la estancia (estado de cuenta). El cobro fiscal es de la 3.ª versión (D-33).
CREATE TABLE IF NOT EXISTS folios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP NULL,
    total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0)
);

-- Los cargos adicionales existentes se ligan al folio (aditivo).
ALTER TABLE additional_charges ADD COLUMN IF NOT EXISTS folio_id UUID NULL
    REFERENCES folios(id) ON DELETE SET NULL;

-- Actividades (D-44…D-47): catálogo, horarios con cupo y reservas de huéspedes.
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) UNIQUE NOT NULL,
    name_es VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NULL,
    name_ru VARCHAR(120) NULL,
    description_es TEXT NULL,
    description_en TEXT NULL,
    description_ru TEXT NULL,
    price_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Inscripción (solo huéspedes con estancia, D-45). El precio va al folio vía cargo (D-46).
CREATE TABLE IF NOT EXISTS activity_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES activity_schedules(id) ON DELETE CASCADE,
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    seats INT NOT NULL DEFAULT 1 CHECK (seats > 0),
    status VARCHAR(12) NOT NULL DEFAULT 'BOOKED'
        CHECK (status IN ('BOOKED', 'WAITLIST', 'CANCELLED', 'ATTENDED')),
    charge_id UUID NULL REFERENCES additional_charges(id) ON DELETE SET NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP NULL
);

-- Housekeeping (D-48…D-51): turnos, reparto y registro de estados operativos.
CREATE TABLE IF NOT EXISTS housekeeping_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL,
    label VARCHAR(20) NOT NULL,           -- MANANA | TARDE | NOCHE
    supervisor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (shift_date, label)
);

CREATE TABLE IF NOT EXISTS housekeeping_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES housekeeping_shifts(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assignee VARCHAR(100) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL,
    UNIQUE (shift_id, room_id)
);

CREATE TABLE IF NOT EXISTS housekeeping_room_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assignment_id UUID NULL REFERENCES housekeeping_assignments(id) ON DELETE SET NULL,
    from_value VARCHAR(12) NULL,
    to_value VARCHAR(12) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Lencería y suministros (D-51): stock con umbral y movimientos.
CREATE TABLE IF NOT EXISTS supply_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) UNIQUE NOT NULL,
    name_es VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NULL,
    name_ru VARCHAR(80) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'unit',
    stock_qty NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    threshold_qty NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (threshold_qty >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
    delta_qty NUMERIC(12, 2) NOT NULL,
    reason VARCHAR(20) NOT NULL
        CHECK (reason IN ('ROOM_CLEANED', 'GUEST_CHECKIN', 'RESTOCK', 'ADJUSTMENT')),
    room_id UUID NULL REFERENCES rooms(id) ON DELETE SET NULL,
    reservation_id UUID NULL REFERENCES reservations(id) ON DELETE SET NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Mantenimiento (D-52…D-54): incidencias con bloqueo de venta y preventivo.
CREATE TABLE IF NOT EXISTS maintenance_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    kind VARCHAR(40) NOT NULL,
    description TEXT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED')),
    blocks_sale BOOLEAN NOT NULL DEFAULT TRUE,
    reported_by VARCHAR(100) NOT NULL,
    assigned_to VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP NULL,
    resolved_by VARCHAR(100) NULL
);

CREATE TABLE IF NOT EXISTS maintenance_incident_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES maintenance_incidents(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL
        CHECK (event_type IN ('REPORTED', 'ASSIGNED', 'RESOLVED', 'CANCELLED')),
    notes VARCHAR(200) NULL,
    actor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preventive_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    equipment VARCHAR(120) NOT NULL,
    room_id UUID NULL REFERENCES rooms(id) ON DELETE SET NULL,
    periodicity VARCHAR(12) NOT NULL
        CHECK (periodicity IN ('WEEKLY', 'MONTHLY', 'QUARTERLY')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preventive_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES preventive_plans(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'DONE', 'SKIPPED')),
    completed_by VARCHAR(100) NULL,
    completed_at TIMESTAMP NULL,
    notes VARCHAR(200) NULL,
    UNIQUE (plan_id, due_date)
);

-- ----------------------------------------------------------------------------
-- 3.7 Dominio: contenido público de la home (bloque 5, D-73/D-74)
-- ----------------------------------------------------------------------------
-- Galería propia del hotel y planes informativos. Gestionados por el
-- administrador con wallet. Mismas reglas de imagen que room_images (solo JPG,
-- <=2 MB) y almacenamiento local en ./docs/imagenes.

CREATE TABLE IF NOT EXISTS hotel_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section VARCHAR(20) NOT NULL,          -- HERO | SERVICES | EXPERIENCE | ACTIVITIES | CONTACT | OTHER
    file_name VARCHAR(200) NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    position INT NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 20),
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    alt_text_es VARCHAR(200) NULL,
    alt_text_en VARCHAR(200) NULL,
    alt_text_ru VARCHAR(200) NULL,
    mime_type VARCHAR(30) NOT NULL DEFAULT 'image/jpeg' CHECK (mime_type = 'image/jpeg'),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT hotel_images_section_check
        CHECK (section IN ('HERO', 'SERVICES', 'EXPERIENCE', 'ACTIVITIES', 'CONTACT', 'OTHER')),
    UNIQUE (section, position)
);

-- Planes/escaparates informativos: sin precios (D-69), con vigencia opcional.
CREATE TABLE IF NOT EXISTS hotel_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) UNIQUE NOT NULL,
    title_es VARCHAR(160) NOT NULL,
    title_en VARCHAR(160) NULL,
    title_ru VARCHAR(160) NULL,
    body_es TEXT NULL,
    body_en TEXT NULL,
    body_ru TEXT NULL,
    image_id UUID NULL REFERENCES hotel_images(id) ON DELETE SET NULL,
    valid_from DATE NULL,
    valid_to DATE NULL,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT hotel_offers_validity_check CHECK (
        valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from
    )
);

-- ============================================================================
-- 4. Índices
-- ============================================================================

-- nfts
CREATE INDEX IF NOT EXISTS idx_nfts_query ON nfts(status, check_in_date, room_type);
CREATE INDEX IF NOT EXISTS idx_nfts_room ON nfts(room_number);
CREATE INDEX IF NOT EXISTS idx_nfts_owner ON nfts(current_owner);
CREATE INDEX IF NOT EXISTS idx_nfts_anchored ON nfts(on_chain_anchored)
    WHERE on_chain_anchored = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfts_recovery_code
    ON nfts(recovery_code) WHERE recovery_code IS NOT NULL;

-- listings
CREATE INDEX IF NOT EXISTS idx_listings_active_price ON listings(active, price_in_wei);
CREATE INDEX IF NOT EXISTS idx_listings_token ON listings(token_id);

-- sale_events
CREATE INDEX IF NOT EXISTS idx_sales_token ON sale_events(token_id);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sale_events(buyer);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sale_events(block_timestamp DESC);

-- admin_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON admin_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON admin_sessions(username, revoked, expires_at);
-- La purga periódica (M9) borra por caducidad: sin índice, cada ciclo recorrería la tabla entera.
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions(expires_at);

-- admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_lock ON admin_users(active, locked_until);

-- mfa_recovery_codes
CREATE INDEX IF NOT EXISTS idx_mfa_codes_user ON mfa_recovery_codes(username, used);

-- email_notifications
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON email_notifications(status, created_at);

-- push_subscriptions
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);

-- checkin_contingency_logs
CREATE INDEX IF NOT EXISTS idx_contingency_token ON checkin_contingency_logs(token_id);

-- additional_charges
CREATE INDEX IF NOT EXISTS idx_charges_token ON additional_charges(token_id, status);

-- stay_checkouts
CREATE INDEX IF NOT EXISTS idx_checkouts_token ON stay_checkouts(token_id);

-- checkout_incidents
CREATE INDEX IF NOT EXISTS idx_checkout_incidents_checkout ON checkout_incidents(checkout_id);

-- worker_processed_logs
CREATE INDEX IF NOT EXISTS idx_worker_processed_contract_block
    ON worker_processed_logs(contract_address, block_number);

-- worker_sale_history
CREATE INDEX IF NOT EXISTS idx_worker_sale_history_block
    ON worker_sale_history(block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_worker_sale_history_ts
    ON worker_sale_history(block_timestamp);

-- rooms (sección 3.5)
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(publication_status, operational_status);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_archived ON rooms(archived_at) WHERE archived_at IS NOT NULL;

-- room_images
CREATE INDEX IF NOT EXISTS idx_room_images_room ON room_images(room_id);
-- Una sola portada por habitación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_images_cover
    ON room_images(room_id) WHERE is_cover = TRUE;
-- Máx. 5 fotos por habitación: posiciones 1..5 únicas por habitación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_images_position ON room_images(room_id, position);

-- room_publications
CREATE INDEX IF NOT EXISTS idx_room_publications_room
    ON room_publications(room_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_publications_pending
    ON room_publications(on_chain_anchored) WHERE on_chain_anchored = FALSE;

-- room_status_history
CREATE INDEX IF NOT EXISTS idx_room_status_history_room
    ON room_status_history(room_id, changed_at DESC);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_room_type ON reviews(room_type);

-- reservations (sección 3.6)
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_hold ON reservations(hold_expires_at)
    WHERE status = 'PENDING';

-- reservation_nights: sin sobreventa (D-41) — una reserva ACTIVA por habitación y noche.
CREATE INDEX IF NOT EXISTS idx_reservation_nights_res ON reservation_nights(reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_nights_hold
    ON reservation_nights(room_id, night_date) WHERE active = TRUE;

-- reservation_contacts / reservation_status_history
CREATE INDEX IF NOT EXISTS idx_reservation_contacts_res ON reservation_contacts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_contacts_purge ON reservation_contacts(purge_at)
    WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservation_history_res
    ON reservation_status_history(reservation_id, changed_at DESC);

-- folios
CREATE INDEX IF NOT EXISTS idx_folios_status ON folios(status);
CREATE INDEX IF NOT EXISTS idx_charges_folio ON additional_charges(folio_id);

-- activities / activity_schedules / activity_bookings
CREATE INDEX IF NOT EXISTS idx_activities_active ON activities(active);
CREATE INDEX IF NOT EXISTS idx_activity_schedules_start ON activity_schedules(activity_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_activity_bookings_schedule ON activity_bookings(schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_bookings_res ON activity_bookings(reservation_id);

-- housekeeping
CREATE INDEX IF NOT EXISTS idx_housekeeping_shifts_date ON housekeeping_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_assignments_assignee
    ON housekeeping_assignments(assignee, status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_logs_room
    ON housekeeping_room_logs(room_id, changed_at DESC);

-- supplies
CREATE INDEX IF NOT EXISTS idx_supply_movements_item
    ON supply_stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_movements_reason ON supply_stock_movements(reason);

-- maintenance
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_room
    ON maintenance_incidents(room_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_open
    ON maintenance_incidents(status, priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_incident
    ON maintenance_incident_events(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_preventive_plans_active ON preventive_plans(active, periodicity);
CREATE INDEX IF NOT EXISTS idx_preventive_tasks_due ON preventive_tasks(status, due_date);

-- hotel_images (sección 3.7)
CREATE INDEX IF NOT EXISTS idx_hotel_images_section ON hotel_images(section, position);
-- Una sola portada por sección de la home.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_images_cover
    ON hotel_images(section) WHERE is_cover = TRUE;

-- hotel_offers
CREATE INDEX IF NOT EXISTS idx_hotel_offers_active ON hotel_offers(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hotel_offers_validity ON hotel_offers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_hotel_offers_image ON hotel_offers(image_id);

-- ============================================================================
-- 5. Datos semilla mínimos (reejecutables)
-- ============================================================================

-- Fila única de agregados del worker (id = 0 por CHECK). Necesaria para que el
-- worker pueda hacer SELECT ... FOR UPDATE desde el primer arranque.
INSERT INTO worker_aggregate_counters (id) VALUES (0) ON CONFLICT (id) DO NOTHING;

-- Catálogo fijo de tipos de habitación (D-22) con el royalty inmutable (ADR-18).
INSERT INTO room_types (code, name_es, name_en, name_ru, base_capacity, royalty_bps, sort_order) VALUES
    ('SIMPLE', 'Simple', 'Single', 'Одноместный', 1, 500, 1),
    ('DOBLE',  'Doble',  'Double', 'Двухместный', 2, 500, 2),
    ('SUITE',  'Suite',  'Suite',  'Люкс',        2, 1000, 3)
ON CONFLICT (code) DO NOTHING;

-- Catálogo inicial de servicios (D-21); el administrador puede ampliarlo después.
INSERT INTO room_amenities (code, name_es, name_en, name_ru, sort_order) VALUES
    ('WIFI',        'Wi-Fi',              'Wi-Fi',            'Wi-Fi',              1),
    ('AC',          'Aire acondicionado', 'Air conditioning', 'Кондиционер',        2),
    ('HEATING',     'Calefacción',        'Heating',          'Отопление',          3),
    ('TV',          'Televisión',         'TV',               'Телевизор',          4),
    ('PRIVATE_BATH','Baño privado',       'Private bathroom', 'Собственная ванная', 5),
    ('BALCONY',     'Balcón',             'Balcony',          'Балкон',             6),
    ('SEA_VIEW',    'Vistas al mar',      'Sea view',         'Вид на море',        7),
    ('MINIBAR',     'Minibar',            'Minibar',          'Мини-бар',           8)
ON CONFLICT (code) DO NOTHING;

-- Ventana global de acuñado en días (D-11).
INSERT INTO platform_settings (key, value) VALUES ('mint_window_days', '90')
ON CONFLICT (key) DO NOTHING;

-- Catálogo inicial de lencería y suministros (D-51). Stock a 0 hasta la primera carga.
INSERT INTO supply_items (code, name_es, name_en, name_ru, unit, threshold_qty) VALUES
    ('SOAP',   'Jabón',   'Soap',    'Мыло',        'unit', 50),
    ('PAPER',  'Papel',   'Toilet paper', 'Бумага', 'roll', 40),
    ('TOWELS', 'Toallas', 'Towels',  'Полотенца',   'unit', 60),
    ('SHEETS', 'Sábanas', 'Sheets',  'Простыни',    'unit', 40)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. Comentarios (COMMENT ON)
-- ============================================================================
-- Se documentan las 44 tablas del esquema (16 base + 9 de habitaciones/reseñas +
-- 17 del bloque 2 + 2 de contenido público) y sus columnas relevantes. Reejecutable:
-- COMMENT ON reemplaza el valor anterior.

-- ---- nfts ----
COMMENT ON TABLE nfts IS 'Inventario de noches-token; PK de negocio token_id (uint256 on-chain)';
COMMENT ON COLUMN nfts.token_id IS 'Identificador canónico de la noche (room·10^8 + AAAAMMDD)';
COMMENT ON COLUMN nfts.room_number IS 'Habitación (101–130, 201–220)';
COMMENT ON COLUMN nfts.room_type IS 'Tipo de habitación: SIMPLE · DOBLE · SUITE';
COMMENT ON COLUMN nfts.check_in_date IS 'Noche de estancia (AAAA-MM-DD)';
COMMENT ON COLUMN nfts.base_price_wei IS 'Precio de venta primaria en wei';
COMMENT ON COLUMN nfts.status IS 'AVAILABLE · CONFIRMING · SOLD · BURNED · CHECKED_IN';
COMMENT ON COLUMN nfts.current_owner IS 'Titular actual (dirección 0x…)';
COMMENT ON COLUMN nfts.check_in_secret_enc IS 'Secreto de check-in cifrado (AES-256-GCM); en retirada (ADR-05)';
COMMENT ON COLUMN nfts.minted_at IS 'Alta del registro';
COMMENT ON COLUMN nfts.checked_in_at IS 'Momento del check-in';
COMMENT ON COLUMN nfts.burned_at IS 'Momento de la quema';
COMMENT ON COLUMN nfts.tx_hash_mint IS 'Transacción de alta; hash centinela si la fila no está anclada';
COMMENT ON COLUMN nfts.on_chain_anchored IS 'TRUE por defecto; FALSE excluye la fila del catálogo público';
COMMENT ON COLUMN nfts.recovery_code IS 'Código corto y estable para localizar la reserva; único cuando no es NULL';

-- ---- listings ----
COMMENT ON TABLE listings IS 'Ofertas de reventa de una noche';
COMMENT ON COLUMN listings.id IS 'PK UUID';
COMMENT ON COLUMN listings.token_id IS 'FK a nfts(token_id) ON DELETE CASCADE';
COMMENT ON COLUMN listings.seller IS 'Vendedor (dirección 0x…)';
COMMENT ON COLUMN listings.price_in_wei IS 'Precio de la oferta en wei';
COMMENT ON COLUMN listings.active IS 'Oferta vigente';
COMMENT ON COLUMN listings.listed_at IS 'Alta de la oferta';
COMMENT ON COLUMN listings.cancelled_at IS 'Cancelación de la oferta';
COMMENT ON COLUMN listings.tx_hash_list IS 'Transacción del listado';

-- ---- sale_events ----
COMMENT ON TABLE sale_events IS 'Histórico auditable de ventas (primarias y reventas) y royalties';
COMMENT ON COLUMN sale_events.id IS 'PK UUID';
COMMENT ON COLUMN sale_events.token_id IS 'FK a nfts(token_id) ON DELETE CASCADE';
COMMENT ON COLUMN sale_events.seller IS 'Vendedor (dirección 0x…)';
COMMENT ON COLUMN sale_events.buyer IS 'Comprador (dirección 0x…)';
COMMENT ON COLUMN sale_events.price_in_wei IS 'Precio de la venta en wei';
COMMENT ON COLUMN sale_events.royalty_amount_wei IS 'Royalty abonado en wei (0 en venta primaria)';
COMMENT ON COLUMN sale_events.is_secondary IS 'TRUE si es reventa; FALSE si es primaria';
COMMENT ON COLUMN sale_events.tx_hash IS 'Transacción de la venta';
COMMENT ON COLUMN sale_events.block_number IS 'Bloque de la venta';
COMMENT ON COLUMN sale_events.block_timestamp IS 'Marca temporal del bloque (reloj de la máquina, DEFAULT NOW())';

-- ---- admin_sessions ----
COMMENT ON TABLE admin_sessions IS 'Sesiones de operador y rotación de refresh token';
COMMENT ON COLUMN admin_sessions.id IS 'PK UUID';
COMMENT ON COLUMN admin_sessions.username IS 'Operador (lógica con admin_users.username, sin FK)';
COMMENT ON COLUMN admin_sessions.role IS 'Rol del operador';
COMMENT ON COLUMN admin_sessions.refresh_token_hash IS 'SHA-256 del refresh token';
COMMENT ON COLUMN admin_sessions.ip_address IS 'Traza pseudonimizada hmac-sha256:<64 hex> (ADR-24); nunca la IP en claro';
COMMENT ON COLUMN admin_sessions.user_agent IS 'Traza pseudonimizada del user agent, mismo formato';
COMMENT ON COLUMN admin_sessions.revoked IS 'Sesión revocada';
COMMENT ON COLUMN admin_sessions.expires_at IS 'Caducidad del refresh';
COMMENT ON COLUMN admin_sessions.created_at IS 'Alta de la sesión';

-- ---- admin_users ----
COMMENT ON TABLE admin_users IS 'Operadores del back-office: bcrypt + TOTP obligatorio';
COMMENT ON COLUMN admin_users.id IS 'PK UUID';
COMMENT ON COLUMN admin_users.username IS 'Identificador de acceso (único)';
COMMENT ON COLUMN admin_users.password_hash IS 'Hash bcrypt de la contraseña';
COMMENT ON COLUMN admin_users.totp_secret_enc IS 'Semilla TOTP cifrada con AES-256-GCM';
COMMENT ON COLUMN admin_users.role IS 'DEFAULT_ADMIN_ROLE · RECEPTION_ROLE · HOUSEKEEPING · MAINTENANCE (D-56: roles de BD sin wallet)';
COMMENT ON COLUMN admin_users.active IS 'Alta/baja del operador';
COMMENT ON COLUMN admin_users.failed_attempts IS 'Intentos fallidos para el bloqueo temporal';
COMMENT ON COLUMN admin_users.locked_until IS 'Bloqueo por fuerza bruta';
COMMENT ON COLUMN admin_users.created_at IS 'Alta del operador';
COMMENT ON COLUMN admin_users.updated_at IS 'Última modificación';

-- ---- mfa_recovery_codes ----
COMMENT ON TABLE mfa_recovery_codes IS 'Códigos de rescate MFA (hash bcrypt); se ligan por username sin FK';
COMMENT ON COLUMN mfa_recovery_codes.id IS 'PK UUID';
COMMENT ON COLUMN mfa_recovery_codes.username IS 'Operador propietario del código (lógica con admin_users.username)';
COMMENT ON COLUMN mfa_recovery_codes.code_hash IS 'Hash bcrypt del código de rescate';
COMMENT ON COLUMN mfa_recovery_codes.used IS 'Código ya consumido';
COMMENT ON COLUMN mfa_recovery_codes.used_at IS 'Momento del consumo';
COMMENT ON COLUMN mfa_recovery_codes.created_at IS 'Alta del código';

-- ---- email_notifications ----
COMMENT ON TABLE email_notifications IS 'Cola persistente de correo con reintentos';
COMMENT ON COLUMN email_notifications.id IS 'PK UUID; jobId determinista para deduplicar en la cola';
COMMENT ON COLUMN email_notifications.event_type IS 'Tipo de aviso';
COMMENT ON COLUMN email_notifications.recipient_email IS 'Correo facilitado por el propio usuario para su aviso';
COMMENT ON COLUMN email_notifications.payload IS 'Contenido del aviso (JSONB)';
COMMENT ON COLUMN email_notifications.status IS 'PENDING · SENT · FAILED';
COMMENT ON COLUMN email_notifications.attempts IS 'Reintentos acumulados';
COMMENT ON COLUMN email_notifications.created_at IS 'Alta del aviso';
COMMENT ON COLUMN email_notifications.sent_at IS 'Envío efectivo';

-- ---- push_subscriptions ----
COMMENT ON TABLE push_subscriptions IS 'Suscripciones de avisos push del navegador';
COMMENT ON COLUMN push_subscriptions.id IS 'PK UUID';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Extremo del navegador (único)';
COMMENT ON COLUMN push_subscriptions.keys_p256dh IS 'Clave pública p256dh de la suscripción';
COMMENT ON COLUMN push_subscriptions.keys_auth IS 'Secreto de autenticación de la suscripción';
COMMENT ON COLUMN push_subscriptions.created_at IS 'Alta de la suscripción';

-- ---- checkin_contingency_logs ----
COMMENT ON TABLE checkin_contingency_logs IS 'Registro de check-in asistido por contingencia';
COMMENT ON COLUMN checkin_contingency_logs.id IS 'PK UUID';
COMMENT ON COLUMN checkin_contingency_logs.token_id IS 'FK a nfts(token_id) ON DELETE CASCADE';
COMMENT ON COLUMN checkin_contingency_logs.room_number IS 'Habitación';
COMMENT ON COLUMN checkin_contingency_logs.check_in_date IS 'Noche de estancia';
COMMENT ON COLUMN checkin_contingency_logs.possession_proof_type IS 'Tipo de prueba de posesión';
COMMENT ON COLUMN checkin_contingency_logs.possession_proof_value IS 'Valor de la prueba de posesión (sin PII)';
COMMENT ON COLUMN checkin_contingency_logs.reason IS 'Motivo de la contingencia';
COMMENT ON COLUMN checkin_contingency_logs.pms_registered IS 'Marca heredada; la plataforma no envía PII al PMS (ADR-20)';
COMMENT ON COLUMN checkin_contingency_logs.processed_at IS 'Momento del check-in asistido';

-- ---- additional_charges ----
COMMENT ON TABLE additional_charges IS 'Cargos adicionales de una estancia (minibar, late check-out, daños…)';
COMMENT ON COLUMN additional_charges.id IS 'PK UUID';
COMMENT ON COLUMN additional_charges.token_id IS 'FK a nfts(token_id) ON DELETE CASCADE';
COMMENT ON COLUMN additional_charges.concept IS 'Concepto del cargo';
COMMENT ON COLUMN additional_charges.amount_cents IS 'Importe en céntimos; CHECK (amount_cents > 0)';
COMMENT ON COLUMN additional_charges.currency IS 'Moneda ISO-4217 (por defecto EUR)';
COMMENT ON COLUMN additional_charges.status IS 'PENDING · CANCELLED · PAID (por defecto PENDING)';
COMMENT ON COLUMN additional_charges.created_by IS 'Operador que crea el cargo';
COMMENT ON COLUMN additional_charges.created_at IS 'Alta del cargo';
COMMENT ON COLUMN additional_charges.cancelled_by IS 'Operador que cancela el cargo';
COMMENT ON COLUMN additional_charges.cancelled_at IS 'Momento de la cancelación';
COMMENT ON COLUMN additional_charges.cancel_reason IS 'Motivo de la cancelación';

-- ---- stay_checkouts ----
COMMENT ON TABLE stay_checkouts IS 'Check-out de una estancia; UNIQUE(token_id) garantiza la idempotencia';
COMMENT ON COLUMN stay_checkouts.id IS 'PK UUID';
COMMENT ON COLUMN stay_checkouts.token_id IS 'FK a nfts(token_id) ON DELETE CASCADE; único';
COMMENT ON COLUMN stay_checkouts.room_number IS 'Habitación';
COMMENT ON COLUMN stay_checkouts.check_in_date IS 'Noche de estancia';
COMMENT ON COLUMN stay_checkouts.room_condition IS 'OK · INCIDENCIA (vocabulario cerrado)';
COMMENT ON COLUMN stay_checkouts.notes IS 'Notas libres del check-out';
COMMENT ON COLUMN stay_checkouts.charges_cancelled IS 'Número de cargos cancelados al cerrar la estancia';
COMMENT ON COLUMN stay_checkouts.processed_by IS 'Operador que procesa el check-out';
COMMENT ON COLUMN stay_checkouts.created_at IS 'Momento del check-out';

-- ---- checkout_incidents ----
COMMENT ON TABLE checkout_incidents IS 'Incidencias marcadas al verificar la habitación en el check-out';
COMMENT ON COLUMN checkout_incidents.id IS 'PK UUID';
COMMENT ON COLUMN checkout_incidents.checkout_id IS 'FK a stay_checkouts(id) ON DELETE CASCADE';
COMMENT ON COLUMN checkout_incidents.kind IS 'Tipo de incidencia (vocabulario cerrado en el dominio)';
COMMENT ON COLUMN checkout_incidents.description IS 'Descripción libre de la incidencia';
COMMENT ON COLUMN checkout_incidents.created_at IS 'Alta de la incidencia';

-- ---- worker_checkpoints ----
COMMENT ON TABLE worker_checkpoints IS 'Checkpoint de sincronización del worker por contrato';
COMMENT ON COLUMN worker_checkpoints.contract_address IS 'PK; contrato vigilado normalizado a minúsculas';
COMMENT ON COLUMN worker_checkpoints.last_block IS 'Último bloque consolidado';
COMMENT ON COLUMN worker_checkpoints.updated_at IS 'Última actualización del checkpoint';

-- ---- worker_processed_logs ----
COMMENT ON TABLE worker_processed_logs IS 'Idempotencia por log on-chain';
COMMENT ON COLUMN worker_processed_logs.log_key IS 'PK; txHash:logIndex (agregados) o keccak256(txHash, logIndex) (email)';
COMMENT ON COLUMN worker_processed_logs.block_number IS 'Bloque del evento (trazabilidad)';
COMMENT ON COLUMN worker_processed_logs.contract_address IS 'Contrato que emitió el evento';
COMMENT ON COLUMN worker_processed_logs.processed_at IS 'Momento del procesamiento';

-- ---- worker_aggregate_counters ----
COMMENT ON TABLE worker_aggregate_counters IS 'Agregados del dashboard; una única fila con id = 0';
COMMENT ON COLUMN worker_aggregate_counters.id IS 'PK; CHECK (id = 0): fila única';
COMMENT ON COLUMN worker_aggregate_counters.primary_volume_wei IS 'Volumen de ventas primarias en wei';
COMMENT ON COLUMN worker_aggregate_counters.royalties_wei IS 'Royalties acumulados en wei';
COMMENT ON COLUMN worker_aggregate_counters.secondary_volume_wei IS 'Volumen de reventas en wei';
COMMENT ON COLUMN worker_aggregate_counters.sold_count IS 'Ventas primarias contadas';
COMMENT ON COLUMN worker_aggregate_counters.minted_count IS 'Tokens minteados contados';
COMMENT ON COLUMN worker_aggregate_counters.burned_count IS 'Tokens quemados contados';
COMMENT ON COLUMN worker_aggregate_counters.last_block IS 'Último bloque agregado';
COMMENT ON COLUMN worker_aggregate_counters.contract_address IS 'Permite detectar un redeploy y resetear el estado';

-- ---- worker_sale_history ----
COMMENT ON TABLE worker_sale_history IS 'Histórico de ventas del worker; una fila por venta (PK compuesta)';
COMMENT ON COLUMN worker_sale_history.tx_hash IS 'PK compuesta con log_index; transacción del evento';
COMMENT ON COLUMN worker_sale_history.log_index IS 'PK compuesta con tx_hash; índice del log';
COMMENT ON COLUMN worker_sale_history.token_id IS 'Noche vendida, derivada del tokenId';
COMMENT ON COLUMN worker_sale_history.room IS 'Habitación derivada del tokenId';
COMMENT ON COLUMN worker_sale_history.date_yyyymmdd IS 'Noche en formato AAAAMMDD, derivada del tokenId';
COMMENT ON COLUMN worker_sale_history.room_type IS 'Tipo de habitación en el momento de la venta';
COMMENT ON COLUMN worker_sale_history.price_wei IS 'Precio de la venta en wei';
COMMENT ON COLUMN worker_sale_history.sale_type_raw IS '0 primaria, 1 reventa';
COMMENT ON COLUMN worker_sale_history.seller IS 'Vendedor (dirección 0x…)';
COMMENT ON COLUMN worker_sale_history.buyer IS 'Comprador (dirección 0x…)';
COMMENT ON COLUMN worker_sale_history.block_number IS 'Bloque del evento';
COMMENT ON COLUMN worker_sale_history.block_timestamp IS 'Marca temporal del bloque (reloj de la cadena); NULL en filas anteriores a M7';

-- ---- room_types ----
COMMENT ON TABLE room_types IS 'Catálogo fijo de tipos de habitación (D-22): SIMPLE · DOBLE · SUITE';
COMMENT ON COLUMN room_types.code IS 'Código del tipo (PK): SIMPLE · DOBLE · SUITE';
COMMENT ON COLUMN room_types.base_capacity IS 'Capacidad base del tipo (orientativa)';
COMMENT ON COLUMN room_types.royalty_bps IS 'Royalty inmutable en puntos básicos (500 = 5 %, 1000 = 10 %), ADR-18';

-- ---- rooms ----
COMMENT ON TABLE rooms IS 'Habitación como ente operativo; la BD es la fuente única del maestro (D-3)';
COMMENT ON COLUMN rooms.id IS 'PK UUID';
COMMENT ON COLUMN rooms.room_number IS 'Número de habitación; único, sin repetir (D-7)';
COMMENT ON COLUMN rooms.floor IS 'Planta (opcional)';
COMMENT ON COLUMN rooms.room_type IS 'FK a room_types(code)';
COMMENT ON COLUMN rooms.capacity IS 'Capacidad de personas (obligatoria)';
COMMENT ON COLUMN rooms.beds IS 'Número de camas (obligatoria)';
COMMENT ON COLUMN rooms.size_m2 IS 'Superficie en m² (opcional)';
COMMENT ON COLUMN rooms.description_es IS 'Descripción en español; obligatoria para publicar (D-6, D-21)';
COMMENT ON COLUMN rooms.description_en IS 'Descripción en inglés (opcional; respaldo al español)';
COMMENT ON COLUMN rooms.description_ru IS 'Descripción en ruso (opcional; respaldo al español)';
COMMENT ON COLUMN rooms.base_rate_wei IS 'Tarifa base en wei (opcional)';
COMMENT ON COLUMN rooms.publication_status IS 'DRAFT · PUBLISHED · PAUSED · MAINTENANCE · OUT_OF_SERVICE (D-19)';
COMMENT ON COLUMN rooms.operational_status IS 'CLEAN · DIRTY · OCCUPIED; lo actualiza housekeeping/recepción (D-19)';
COMMENT ON COLUMN rooms.archived_at IS 'NULL = vigente; con fecha = archivada, nunca borrada (D-8)';

-- ---- room_images ----
COMMENT ON TABLE room_images IS 'Galería de la habitación; solo JPG, <=2 MB y máx. 5 fotos (D-20)';
COMMENT ON COLUMN room_images.room_id IS 'FK a rooms(id) ON DELETE CASCADE';
COMMENT ON COLUMN room_images.file_name IS 'Nombre único: <habitación>-<tipo>-<fecha subida>-<nº imagen> (D-5, D-12)';
COMMENT ON COLUMN room_images.storage_path IS 'Ruta en el servidor (carpeta ./docs/imagenes)';
COMMENT ON COLUMN room_images.position IS 'Orden 1..5; la posición 1 es la portada por convención';
COMMENT ON COLUMN room_images.is_cover IS 'Portada; una sola por habitación (índice único parcial)';
COMMENT ON COLUMN room_images.byte_size IS 'Tamaño en bytes; CHECK <= 2097152 (2 MB)';
COMMENT ON COLUMN room_images.uploaded_by IS 'Operador que sube la imagen';

-- ---- room_amenities / room_amenity_links ----
COMMENT ON TABLE room_amenities IS 'Catálogo de servicios/amenidades (D-21)';
COMMENT ON TABLE room_amenity_links IS 'Servicios asignados a cada habitación (N:M)';

-- ---- room_publications ----
COMMENT ON TABLE room_publications IS 'Publicaciones ancladas: huella de la ficha + nº + fecha (D-2, D-18)';
COMMENT ON COLUMN room_publications.content_hash IS 'Huella (keccak256) del contenido publicado';
COMMENT ON COLUMN room_publications.tx_hash IS 'Transacción de anclaje; NULL si aún no está anclada';
COMMENT ON COLUMN room_publications.on_chain_anchored IS 'TRUE cuando el anclaje se confirma en la cadena';

-- ---- room_status_history ----
COMMENT ON TABLE room_status_history IS 'Historial de cambios de estado (publicación u operativo), D-19';
COMMENT ON COLUMN room_status_history.status_kind IS 'PUBLICATION · OPERATIONAL';

-- ---- reviews ----
COMMENT ON TABLE reviews IS 'Reseñas anónimas y verificadas por noche consumida (D-27, D-28)';
COMMENT ON COLUMN reviews.token_id IS 'FK a nfts(token_id); UNIQUE: una reseña por noche consumida';
COMMENT ON COLUMN reviews.room_type IS 'Tipo de habitación; es lo único que se publica (nunca el nº exacto, D-28)';
COMMENT ON COLUMN reviews.room_id IS 'Referencia interna a la habitación; no se publica; se anula al borrar la habitación';
COMMENT ON COLUMN reviews.rating IS 'Puntuación 1..5';
COMMENT ON COLUMN reviews.status IS 'PENDING · APPROVED · REJECTED (moderación del administrador)';

-- ---- platform_settings ----
COMMENT ON TABLE platform_settings IS 'Ajustes de plataforma (D-11): ventana global de acuñado y similares';
COMMENT ON COLUMN platform_settings.key IS 'Clave del ajuste (PK), p. ej. mint_window_days';
COMMENT ON COLUMN platform_settings.value IS 'Valor del ajuste en texto';

-- ---- reservations ----
COMMENT ON TABLE reservations IS 'Reserva de estancia (D-34…D-43); retiene la noche sin acuñar';
COMMENT ON COLUMN reservations.room_id IS 'FK a rooms(id) ON DELETE RESTRICT';
COMMENT ON COLUMN reservations.channel IS 'WEB (web con wallet) · COUNTER (mostrador)';
COMMENT ON COLUMN reservations.status IS 'PENDING · CONFIRMED · CANCELLED · NO_SHOW · COMPLETED';
COMMENT ON COLUMN reservations.hold_expires_at IS 'Vencimiento del bloqueo (D-37); al vencer se libera';
COMMENT ON COLUMN reservations.deposit_required_cents IS 'Anticipo exigido (por defecto 30 %)';
COMMENT ON COLUMN reservations.deposit_paid_cents IS 'Anticipo cobrado';
COMMENT ON COLUMN reservations.cancel_reason IS 'Motivo de cancelación (D-40)';

-- ---- reservation_nights ----
COMMENT ON TABLE reservation_nights IS 'Noches retenidas por la reserva; sin sobreventa (D-41)';
COMMENT ON COLUMN reservation_nights.token_id IS 'Token emitido al pagar el 100 % (D-39); NULL mientras no se paga';
COMMENT ON COLUMN reservation_nights.active IS 'FALSE libera la retención (índice único parcial)';

-- ---- reservation_contacts ----
COMMENT ON TABLE reservation_contacts IS 'Contacto mínimo CIFRADO y purgable (D-55); nunca PII completa';
COMMENT ON COLUMN reservation_contacts.value_enc IS 'Email o usuario de Telegram cifrado con AES-256-GCM';
COMMENT ON COLUMN reservation_contacts.purge_at IS 'Fecha de purga (al finalizar la estancia)';

-- ---- reservation_status_history ----
COMMENT ON TABLE reservation_status_history IS 'Historial de estados de la reserva para trazabilidad';

-- ---- folios ----
COMMENT ON TABLE folios IS 'Estado de cuenta de la estancia; el cobro fiscal es de la 3.ª versión (D-33)';
COMMENT ON COLUMN folios.status IS 'OPEN · CLOSED';

-- ---- activities / activity_schedules / activity_bookings ----
COMMENT ON TABLE activities IS 'Catálogo de actividades del hotel (D-44)';
COMMENT ON TABLE activity_schedules IS 'Horarios con aforo (D-47): capacity es el cupo estricto';
COMMENT ON TABLE activity_bookings IS 'Inscripción de un huésped con estancia (D-45); BOOKED · WAITLIST · CANCELLED · ATTENDED';
COMMENT ON COLUMN activity_bookings.charge_id IS 'Cargo en el folio por el precio de la actividad (D-46)';

-- ---- housekeeping ----
COMMENT ON TABLE housekeeping_shifts IS 'Turno de limpieza por día y franja (D-48)';
COMMENT ON TABLE housekeeping_assignments IS 'Habitación asignada a una mucama dentro de un turno (D-48)';
COMMENT ON TABLE housekeeping_room_logs IS 'Cambios del estado operativo (CLEAN · DIRTY · OCCUPIED) (D-19/D-50)';

-- ---- supplies ----
COMMENT ON TABLE supply_items IS 'Lencería y suministros con umbral crítico (D-51)';
COMMENT ON COLUMN supply_items.threshold_qty IS 'Umbral crítico; por debajo se emite alerta';
COMMENT ON TABLE supply_stock_movements IS 'Movimientos de stock; el descuento es automático (D-51)';

-- ---- maintenance ----
COMMENT ON TABLE maintenance_incidents IS 'Incidencia técnica; con blocks_sale retira la habitación de venta (D-53)';
COMMENT ON COLUMN maintenance_incidents.status IS 'OPEN · IN_PROGRESS · RESOLVED · CANCELLED';
COMMENT ON COLUMN maintenance_incidents.blocks_sale IS 'TRUE mientras bloquea la venta; al resolverse se libera (D-53)';
COMMENT ON TABLE maintenance_incident_events IS 'Historial de la incidencia (reporte, asignación, resolución)';
COMMENT ON TABLE preventive_plans IS 'Plan de mantenimiento preventivo con periodicidad (D-54)';
COMMENT ON TABLE preventive_tasks IS 'Tarea preventiva programada con aviso y registro de cumplimiento (D-54)';

-- ---- hotel_images ----
COMMENT ON TABLE hotel_images IS 'Galería propia del hotel para la home (D-66, D-73)';
COMMENT ON COLUMN hotel_images.section IS 'Sección de la home: HERO · SERVICES · EXPERIENCE · ACTIVITIES · CONTACT · OTHER';
COMMENT ON COLUMN hotel_images.file_name IS 'Nombre único: hotel-<seccion>-<fecha subida>-<nº> (D-66)';
COMMENT ON COLUMN hotel_images.is_cover IS 'Portada de la sección; una sola por sección';

-- ---- hotel_offers ----
COMMENT ON TABLE hotel_offers IS 'Planes/escaparates informativos de la home (D-69, D-74); sin precios';
COMMENT ON COLUMN hotel_offers.code IS 'Código único del plan';
COMMENT ON COLUMN hotel_offers.image_id IS 'FK a hotel_images(id) ON DELETE SET NULL';
COMMENT ON COLUMN hotel_offers.valid_from IS 'Inicio de vigencia (opcional)';
COMMENT ON COLUMN hotel_offers.valid_to IS 'Fin de vigencia (opcional); posterior o igual al inicio';
COMMENT ON COLUMN hotel_offers.sort_order IS 'Orden de presentación en la home';

-- ============================================================================
-- Fin de base_datos.sql
-- ============================================================================
