import type { Pool } from "pg";
import { getDbPool } from "./pool";

export const INITIAL_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE INDEX IF NOT EXISTS idx_nfts_query ON nfts(status, check_in_date, room_type);
CREATE INDEX IF NOT EXISTS idx_nfts_room ON nfts(room_number);
CREATE INDEX IF NOT EXISTS idx_nfts_owner ON nfts(current_owner);

-- Anclaje on-chain (D-04/RF-03): una fila solo es válida si su tx_hash_mint procede de una
-- transacción real. El minteo masivo del back-office NO emite transacciones, así que sus filas
-- se persisten marcadas como no ancladas (FALSE), con el hash centinela cero en tx_hash_mint, y
-- quedan EXCLUIDAS del catálogo público. El worker las promueve a TRUE cuando ancla el lote.
-- El DEFAULT TRUE es la opción conservadora: las filas preexistentes (escritas por el worker a
-- partir de eventos on-chain) conservan su significado y no desaparecen del catálogo.
ALTER TABLE nfts ADD COLUMN IF NOT EXISTS on_chain_anchored BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_nfts_anchored ON nfts(on_chain_anchored)
    WHERE on_chain_anchored = FALSE;

-- Código de recuperación de reserva (D-32, CU-32): identificador corto y ESTABLE del token que
-- recepción teclea si el QR del huésped no está disponible. Se deriva del tokenId con
-- recoveryCodeForToken (nunca de datos personales, RNF-30) y su unicidad permite localizar la
-- reserva con un índice en lugar de recorrer la tabla.
ALTER TABLE nfts ADD COLUMN IF NOT EXISTS recovery_code VARCHAR(16) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nfts_recovery_code
    ON nfts(recovery_code) WHERE recovery_code IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_listings_active_price ON listings(active, price_in_wei);
CREATE INDEX IF NOT EXISTS idx_listings_token ON listings(token_id);

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

CREATE INDEX IF NOT EXISTS idx_sales_token ON sale_events(token_id);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sale_events(buyer);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sale_events(block_timestamp DESC);

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

CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON admin_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON admin_sessions(username, revoked, expires_at);
-- La purga periódica (M9) borra por caducidad: sin índice, cada ciclo recorrería la tabla entera.
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions(expires_at);

-- ============================================================================
-- Operadores del back-office (D-04): sistema canónico de autenticación.
-- Contraseña (bcrypt) + TOTP obligatorio. La semilla TOTP NUNCA se guarda en claro:
-- va cifrada con AES-256-GCM usando AES_SECRET_KEY (sin valor por defecto en el código).
-- El rol es uno de los que gobiernan el back-office
-- (DEFAULT_ADMIN_ROLE | RECEPTION_ROLE | HOUSEKEEPING | MAINTENANCE; D-56 añade los dos
-- últimos como roles de BD SIN wallet para el personal de limpieza y mantenimiento).
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_lock ON admin_users(active, locked_until);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    code_hash VARCHAR(60) NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_codes_user ON mfa_recovery_codes(username, used);

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

CREATE INDEX IF NOT EXISTS idx_notifications_pending ON email_notifications(status, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);

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

CREATE INDEX IF NOT EXISTS idx_contingency_token ON checkin_contingency_logs(token_id);

-- ============================================================================
-- Recepción: cargos adicionales y check-out (D-33/D-34, incremento v2) — off-chain.
-- El contrato canónico NO cambia: la estancia y sus cargos son estado operativo del hotel, y el
-- check-out se ancla aquí (no en la cadena). Nada de estas tablas guarda datos personales (RNF-30).
-- ============================================================================

-- Cargos adicionales de una estancia (minibar, late check-out, daños…). Recepción los crea y el
-- check-out los cancela; el MVP no los cobra (fuera de alcance).
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

CREATE INDEX IF NOT EXISTS idx_charges_token ON additional_charges(token_id, status);

-- Check-out de una estancia. UNIQUE(token_id) garantiza la idempotencia (RNF-34): un segundo
-- check-out devuelve el registro existente en lugar de duplicarlo.
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

CREATE INDEX IF NOT EXISTS idx_checkouts_token ON stay_checkouts(token_id);

-- Incidencias marcadas al verificar la habitación en el check-out (vocabulario cerrado).
CREATE TABLE IF NOT EXISTS checkout_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_id UUID NOT NULL REFERENCES stay_checkouts(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL,
    description VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_incidents_checkout ON checkout_incidents(checkout_id);

-- ============================================================================
-- Estado del mini-worker (D-09): checkpoints, idempotencia, agregados e histórico
-- viven en PostgreSQL, la MISMA base que usa la web/API (una sola verdad).
-- Importes en wei como NUMERIC(78, 0): cubren uint256 sin pérdida de precisión.
-- ============================================================================

-- Checkpoint de sincronización por contrato (estado del worker).
CREATE TABLE IF NOT EXISTS worker_checkpoints (
    contract_address VARCHAR(42) PRIMARY KEY,
    last_block BIGINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotencia por log on-chain: la PK es la clave del log (txHash:logIndex para los
-- agregados, keccak256(txHash, logIndex) para el aviso por email).
CREATE TABLE IF NOT EXISTS worker_processed_logs (
    log_key VARCHAR(120) PRIMARY KEY,
    block_number BIGINT NULL,
    contract_address VARCHAR(42) NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_processed_contract_block
    ON worker_processed_logs(contract_address, block_number);

-- Agregados del dashboard: una UNICA fila (id = 0). contract_address detecta el redeploy
-- para resetear el estado y no arrastrar datos del contrato anterior.
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

INSERT INTO worker_aggregate_counters (id) VALUES (0) ON CONFLICT (id) DO NOTHING;

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

CREATE INDEX IF NOT EXISTS idx_worker_sale_history_block
    ON worker_sale_history(block_number DESC, log_index DESC);

-- Migración incremental para bases ya creadas (M7). El ORDEN importa: en PostgreSQL el
-- CREATE TABLE IF NOT EXISTS NO añade columnas a una tabla que ya existía, así que el índice
-- sobre block_timestamp tiene que ir DESPUÉS del ALTER (si no, falla con «no existe la columna»
-- justo en el arranque del worker).
ALTER TABLE worker_sale_history ADD COLUMN IF NOT EXISTS block_timestamp TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_worker_sale_history_ts
    ON worker_sale_history(block_timestamp);

-- ============================================================================
-- Habitaciones y reseñas (Suite Administración → Habitación, D-1…D-28).
-- La BD es la fuente única del maestro (D-3); la ficha se modela aquí y el
-- registro on-chain se alimenta desde ella en el corte final (F8). Sin PII de
-- viajeros (ADR-20/RNF-30). Sincronizado con RepoTecnico/base_datos.sql §3.5,
-- diccionario_datos.md §3.8–§3.9 y diagrama_er.md §6.
-- ============================================================================

-- Catálogo fijo de tipos de habitación (D-22) con el royalty inmutable (ADR-18).
CREATE TABLE IF NOT EXISTS room_types (
    code VARCHAR(10) PRIMARY KEY,           -- SIMPLE | DOBLE | SUITE
    name_es VARCHAR(40) NOT NULL,
    name_en VARCHAR(40) NOT NULL,
    name_ru VARCHAR(40) NOT NULL,
    base_capacity INT NOT NULL CHECK (base_capacity > 0),
    royalty_bps INT NOT NULL CHECK (royalty_bps BETWEEN 0 AND 10000),
    sort_order INT NOT NULL DEFAULT 0
);

-- Habitación como ente operativo (D-1, D-19, D-21).
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number INT UNIQUE NOT NULL CHECK (room_number > 0),
    floor INT NULL,
    room_type VARCHAR(10) NOT NULL REFERENCES room_types(code) ON UPDATE CASCADE,
    capacity INT NOT NULL CHECK (capacity > 0),
    beds INT NOT NULL CHECK (beds > 0),
    size_m2 NUMERIC(6, 2) NULL CHECK (size_m2 IS NULL OR size_m2 > 0),
    -- Descripción obligatoria en español solo para PUBLICAR (D-6, D-21); EN/RU opcionales.
    description_es TEXT NULL,
    description_en TEXT NULL,
    description_ru TEXT NULL,
    base_rate_wei NUMERIC(78, 0) NULL,
    -- Ficha ampliada (2026-10-02): características físicas de la vista, accesibilidad y decoración.
    -- Las columnas decorativas cortas son un descriptor técnico; las notas sí son de cara al huésped
    -- y por eso van en los tres idiomas (igual que las descripciones).
    view_kind VARCHAR(12) NULL,               -- SEA | GARDEN | INTERIOR
    has_balcony BOOLEAN NOT NULL DEFAULT FALSE,
    is_accessible BOOLEAN NOT NULL DEFAULT FALSE,
    decor_style VARCHAR(20) NULL,             -- MEDITERRANEAN | CONTEMPORARY | CLASSIC | RUSTIC | MINIMAL
    decor_palette VARCHAR(120) NULL,
    decor_materials VARCHAR(200) NULL,
    decor_notes_es TEXT NULL,
    decor_notes_en TEXT NULL,
    decor_notes_ru TEXT NULL,
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
        CHECK (operational_status IN ('CLEAN', 'DIRTY', 'OCCUPIED', 'PENDING_CLEANING')),
    CONSTRAINT rooms_view_kind_check
        CHECK (view_kind IS NULL OR view_kind IN ('SEA', 'GARDEN', 'INTERIOR')),
    CONSTRAINT rooms_decor_style_check
        CHECK (decor_style IS NULL OR decor_style IN ('MEDITERRANEAN', 'CONTEMPORARY', 'CLASSIC', 'RUSTIC', 'MINIMAL')),
    CONSTRAINT rooms_publish_requires_es CHECK (
        publication_status <> 'PUBLISHED' OR description_es IS NOT NULL
    )
);

-- Migración incremental (2026-10-02): la ficha ampliada entra también en bases ya creadas. El
-- IF NOT EXISTS de la columna hace idempotente el bloque, y el CHECK va en línea para que no
-- puedan coexistir dos restricciones equivalentes.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS view_kind VARCHAR(12) NULL
    CHECK (view_kind IS NULL OR view_kind IN ('SEA', 'GARDEN', 'INTERIOR'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS has_balcony BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_style VARCHAR(20) NULL
    CHECK (decor_style IS NULL OR decor_style IN ('MEDITERRANEAN', 'CONTEMPORARY', 'CLASSIC', 'RUSTIC', 'MINIMAL'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_palette VARCHAR(120) NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_materials VARCHAR(200) NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_notes_es TEXT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_notes_en TEXT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS decor_notes_ru TEXT NULL;

-- Migración incremental (2026-10-06): nuevo estado operativo post-check-out. Se elimina y recrea el
-- CHECK para que las bases ya creadas admitan el valor nuevo sin perder la restricción.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_operational_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_operational_status_check
    CHECK (operational_status IN ('CLEAN', 'DIRTY', 'OCCUPIED', 'PENDING_CLEANING'));

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(publication_status, operational_status);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_archived ON rooms(archived_at) WHERE archived_at IS NOT NULL;

-- Galería (D-5, D-12, D-20): solo JPG, <=2 MB y máx. 5 fotos por habitación.
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

CREATE INDEX IF NOT EXISTS idx_room_images_room ON room_images(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_images_cover
    ON room_images(room_id) WHERE is_cover = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_images_position ON room_images(room_id, position);

-- Catálogo de servicios/amenidades (D-21) y su asignación N:M.
CREATE TABLE IF NOT EXISTS room_amenities (
    code VARCHAR(40) PRIMARY KEY,
    name_es VARCHAR(60) NOT NULL,
    name_en VARCHAR(60) NOT NULL,
    name_ru VARCHAR(60) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_amenity_links (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    amenity_code VARCHAR(40) NOT NULL REFERENCES room_amenities(code) ON UPDATE CASCADE,
    PRIMARY KEY (room_id, amenity_code)
);

-- Espacios de la habitación (2026-10-02): catálogo fijo con nombre trilingüe + superficie por
-- habitación. Se modela como catálogo + enlace (igual que los servicios) para que el formulario
-- ofrezca opciones cerradas y la ficha no dependa de texto libre.
CREATE TABLE IF NOT EXISTS room_space_types (
    code VARCHAR(20) PRIMARY KEY,           -- DORMITORIO | SALON | BANO | TERRAZA | COCINA | VESTIDOR
    name_es VARCHAR(40) NOT NULL,
    name_en VARCHAR(40) NOT NULL,
    name_ru VARCHAR(40) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_spaces (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    space_code VARCHAR(20) NOT NULL REFERENCES room_space_types(code) ON UPDATE CASCADE,
    size_m2 NUMERIC(6, 2) NULL CHECK (size_m2 IS NULL OR size_m2 > 0),
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, space_code)
);

CREATE INDEX IF NOT EXISTS idx_room_spaces_room ON room_spaces(room_id);

-- Publicaciones ancladas (D-2, D-18): huella de la ficha + nº de habitación + fecha.
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

CREATE INDEX IF NOT EXISTS idx_room_publications_room
    ON room_publications(room_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_publications_pending
    ON room_publications(on_chain_anchored) WHERE on_chain_anchored = FALSE;

-- Historial de cambios de estado (publicación u operativo), D-19.
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

CREATE INDEX IF NOT EXISTS idx_room_status_history_room
    ON room_status_history(room_id, changed_at DESC);

-- Checklist operativo de limpieza y preparación de la habitación (RF-52/RF-55).
-- Catálogo fijo de ítems; el registro se vincula opcionalmente a una asignación de housekeeping.
CREATE TABLE IF NOT EXISTS room_cleaning_checklist_items (
    code VARCHAR(30) PRIMARY KEY,
    name_es VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NOT NULL,
    name_ru VARCHAR(80) NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0
);

-- NOTA (orden de creación, 2026-10-06): la tabla room_cleaning_checklists referencia
-- housekeeping_assignments, así que se crea MÁS ABAJO, después de las tablas de
-- ama de llaves. Estaba aquí y la migración de una base **vacía** abortaba con
-- «relation "housekeeping_assignments" does not exist» (el script entero se ejecuta
-- en una sola sentencia, así que no se creaba NINGUNA tabla).

INSERT INTO room_cleaning_checklist_items (code, name_es, name_en, name_ru, is_mandatory, sort_order) VALUES
    ('CLEANING',        'Limpieza',                    'Cleaning',            'Уборка',              true,  1),
    ('DEODORIZATION',   'Desodorización',              'Deodorization',       'Дезодорация',         true,  2),
    ('LINEN_CHANGE',    'Cambio de Lencería',          'Linen change',        'Смена белья',         true,  3),
    ('CLIMATE',         'Climatización',               'Climate control',     'Климат-контроль',     true,  4),
    ('SUPPLIES',        'Restitución de Suministros',  'Supplies restock',    'Пополнение расходников', true, 5),
    ('SPECIAL_REQUESTS','Solicitudes Especiales',      'Special requests',    'Особые пожелания',    false, 6)
ON CONFLICT (code) DO NOTHING;

-- Reseñas (D-27, D-28): anónimas y verificadas por noche consumida. NUNCA se
-- publica el número exacto de habitación: solo el tipo.
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
    moderated_at TIMESTAMP NULL,
    -- Motivo de la moderación (F6 · D-58): por qué se aprobó o rechazó la reseña.
    moderation_notes VARCHAR(200) NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_room_type ON reviews(room_type);

-- Migración incremental (F6): la nota de moderación se añade a bases ya creadas.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_notes VARCHAR(200) NULL;

-- Ajustes de plataforma (D-11): ventana global de acuñado y similares.
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by VARCHAR(100) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Semillas reejecutables (catálogos fijos y ventana de acuñado).
INSERT INTO room_types (code, name_es, name_en, name_ru, base_capacity, royalty_bps, sort_order) VALUES
    ('SIMPLE', 'Simple', 'Single', 'Одноместный', 1, 500, 1),
    ('DOBLE',  'Doble',  'Double', 'Двухместный', 2, 500, 2),
    ('SUITE',  'Suite',  'Suite',  'Люкс',        2, 1000, 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO room_amenities (code, name_es, name_en, name_ru, sort_order) VALUES
    ('WIFI',         'Wi-Fi',              'Wi-Fi',            'Wi-Fi',              1),
    ('AC',           'Aire acondicionado', 'Air conditioning', 'Кондиционер',        2),
    ('HEATING',      'Calefacción',        'Heating',          'Отопление',          3),
    ('TV',           'Televisión',         'TV',               'Телевизор',          4),
    ('PRIVATE_BATH', 'Baño privado',       'Private bathroom', 'Собственная ванная', 5),
    ('BALCONY',      'Balcón',             'Balcony',          'Балкон',             6),
    ('SEA_VIEW',     'Vistas al mar',      'Sea view',         'Вид на море',        7),
    ('MINIBAR',      'Minibar',            'Minibar',          'Мини-бар',           8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO room_space_types (code, name_es, name_en, name_ru, sort_order) VALUES
    ('DORMITORIO', 'Dormitorio', 'Bedroom',   'Спальня',     1),
    ('SALON',      'Salón',      'Living room', 'Гостиная',  2),
    ('BANO',       'Baño',       'Bathroom',  'Ванная',      3),
    ('TERRAZA',    'Terraza',    'Terrace',   'Терраса',     4),
    ('COCINA',     'Cocina',     'Kitchen',   'Кухня',       5),
    ('VESTIDOR',   'Vestidor',   'Walk-in closet', 'Гардеробная', 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO platform_settings (key, value) VALUES ('mint_window_days', '90')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Bloque 2: reservas, actividades, housekeeping y mantenimiento (D-34…D-55).
-- Sincronizado con RepoTecnico/base_datos.sql §3.6. Sin PII de viajeros salvo
-- el contacto mínimo cifrado y purgable (D-55).
-- ============================================================================

-- Reserva (D-34/D-35/D-37/D-40/D-41/D-43): retiene la noche sin acuñar.
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
    adult_count INT NOT NULL DEFAULT 1 CHECK (adult_count >= 0),
    child_count INT NOT NULL DEFAULT 0 CHECK (child_count >= 0),
    baby_count INT NOT NULL DEFAULT 0 CHECK (baby_count >= 0),
    pet_count INT NOT NULL DEFAULT 0 CHECK (pet_count >= 0),
    accessibility_count INT NOT NULL DEFAULT 0 CHECK (accessibility_count >= 0),
    CONSTRAINT reservations_dates_check CHECK (check_out_date > check_in_date),
    CONSTRAINT reservations_status_check
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'))
);

-- Migración incremental (2026-10-06): contadores de ocupación de la reserva (edades, mascotas, PMR).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS adult_count INT NOT NULL DEFAULT 1 CHECK (adult_count >= 0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS child_count INT NOT NULL DEFAULT 0 CHECK (child_count >= 0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS baby_count INT NOT NULL DEFAULT 0 CHECK (baby_count >= 0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pet_count INT NOT NULL DEFAULT 0 CHECK (pet_count >= 0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS accessibility_count INT NOT NULL DEFAULT 0 CHECK (accessibility_count >= 0);

CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_hold ON reservations(hold_expires_at)
    WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS reservation_nights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    night_date DATE NOT NULL,
    token_id VARCHAR(66) NULL REFERENCES nfts(token_id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_reservation_nights_res ON reservation_nights(reservation_id);
-- Sin sobreventa (D-41): una reserva ACTIVA por habitación y noche.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_nights_hold
    ON reservation_nights(room_id, night_date) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS reservation_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    channel VARCHAR(12) NOT NULL CHECK (channel IN ('EMAIL', 'TELEGRAM', 'WEB')),
    value_enc TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    purge_at TIMESTAMP NOT NULL,
    purged_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_reservation_contacts_res ON reservation_contacts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_contacts_purge ON reservation_contacts(purge_at)
    WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS reservation_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    from_value VARCHAR(12) NULL,
    to_value VARCHAR(12) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    reason VARCHAR(200) NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_history_res
    ON reservation_status_history(reservation_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS folios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP NULL,
    total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_folios_status ON folios(status);

ALTER TABLE additional_charges ADD COLUMN IF NOT EXISTS folio_id UUID NULL
    REFERENCES folios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_charges_folio ON additional_charges(folio_id);

-- Actividades (F5 · D-46): un cargo de actividad se imputa al FOLIO de la estancia y puede no tener
-- todavía un token emitido (reserva confirmada antes de la liquidación al 100 %, D-57). Por eso
-- «token_id» deja de ser obligatorio: la pertenencia la marca «folio_id» (añadido arriba).
ALTER TABLE additional_charges ALTER COLUMN token_id DROP NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_activities_active ON activities(active);

CREATE TABLE IF NOT EXISTS activity_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_schedules_start ON activity_schedules(activity_id, starts_at);

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

CREATE INDEX IF NOT EXISTS idx_activity_bookings_schedule ON activity_bookings(schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_bookings_res ON activity_bookings(reservation_id);

CREATE TABLE IF NOT EXISTS housekeeping_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL,
    label VARCHAR(20) NOT NULL,           -- MANANA | TARDE | NOCHE
    supervisor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (shift_date, label)
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_shifts_date ON housekeeping_shifts(shift_date);

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

CREATE INDEX IF NOT EXISTS idx_housekeeping_assignments_assignee
    ON housekeeping_assignments(assignee, status);

CREATE TABLE IF NOT EXISTS housekeeping_room_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assignment_id UUID NULL REFERENCES housekeeping_assignments(id) ON DELETE SET NULL,
    from_value VARCHAR(12) NULL,
    to_value VARCHAR(12) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_logs_room
    ON housekeeping_room_logs(room_id, changed_at DESC);

-- Checklist operativo de limpieza y preparación de la habitación (RF-52/RF-55).
-- Se crea aquí (y no junto al catálogo de ítems) porque referencia la asignación de
-- ama de llaves creada justo arriba.
CREATE TABLE IF NOT EXISTS room_cleaning_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assignment_id UUID NULL REFERENCES housekeeping_assignments(id) ON DELETE SET NULL,
    item_code VARCHAR(30) NOT NULL REFERENCES room_cleaning_checklist_items(code) ON UPDATE CASCADE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_by VARCHAR(100) NULL,
    completed_at TIMESTAMP NULL,
    notes VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, assignment_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_room_cleaning_checklists_room
    ON room_cleaning_checklists(room_id, assignment_id, item_code);

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

CREATE INDEX IF NOT EXISTS idx_supply_movements_item
    ON supply_stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_movements_reason ON supply_stock_movements(reason);

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

CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_room
    ON maintenance_incidents(room_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_open
    ON maintenance_incidents(status, priority);

CREATE TABLE IF NOT EXISTS maintenance_incident_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES maintenance_incidents(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL
        CHECK (event_type IN ('REPORTED', 'ASSIGNED', 'RESOLVED', 'CANCELLED')),
    notes VARCHAR(200) NULL,
    actor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_incident
    ON maintenance_incident_events(incident_id, created_at);

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

CREATE INDEX IF NOT EXISTS idx_preventive_plans_active ON preventive_plans(active, periodicity);

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

CREATE INDEX IF NOT EXISTS idx_preventive_tasks_due ON preventive_tasks(status, due_date);

-- Catálogo inicial de lencería y suministros (D-51). Stock a 0 hasta la primera carga.
INSERT INTO supply_items (code, name_es, name_en, name_ru, unit, threshold_qty) VALUES
    ('SOAP',   'Jabón',   'Soap',         'Мыло',      'unit', 50),
    ('PAPER',  'Papel',   'Toilet paper', 'Бумага',    'roll', 40),
    ('TOWELS', 'Toallas', 'Towels',       'Полотенца', 'unit', 60),
    ('SHEETS', 'Sábanas', 'Sheets',       'Простыни',  'unit', 40)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Bloque 5: contenido público de la home (D-66, D-69, D-73, D-74).
-- Sincronizado con RepoTecnico/base_datos.sql §3.7.
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_hotel_images_section ON hotel_images(section, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_images_cover
    ON hotel_images(section) WHERE is_cover = TRUE;

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

CREATE INDEX IF NOT EXISTS idx_hotel_offers_active ON hotel_offers(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hotel_offers_validity ON hotel_offers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_hotel_offers_image ON hotel_offers(image_id);

-- ============================================================================
-- vNext · Fase 3 · F1 — Suite de Mantenimiento + Ama de llaves (CU-V-40, RNF-M-19)
-- ----------------------------------------------------------------------------
-- Portado LITERALMENTE del artefacto aprobado y auditado
-- RepoTecnico/propuesta_vNext/base_datos.sql (auditoría V1: 39 hallazgos resueltos).
-- 12 tablas nuevas, 19 columnas y 3 CHECK sobre 4 tablas existentes (la 5.ª tabla
-- extendida, admin_users, es extensión lógica de roles: sin DDL), semilla de 10 áreas
-- comunes (4 críticas) y el trigger append-only de la auditoría. Orden de dependencias
-- verificado: ninguna FK apunta hacia adelante.
-- ============================================================================

-- ============================================================================
-- 2. Semilla de roles extendidos en admin_users (solo documentación; la
--    restricción real vive en la capa de dominio).
-- ============================================================================
-- admin_users.role admite ahora también:
--   HEAD_MAINTENANCE, HEAD_KEEPER, MAINTENANCE_TECH, HOUSEKEEPER
-- junto a los valores existentes:
--   DEFAULT_ADMIN_ROLE, RECEPTION_ROLE, HOUSEKEEPING, MAINTENANCE

-- ============================================================================
-- 2.5 Operarios de terminales fijos (técnicos y camareras)
-- ============================================================================
CREATE TABLE IF NOT EXISTS terminal_operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    pin_hash TEXT NOT NULL,
    pin_changed_at TIMESTAMP NULL,
    must_change_pin BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMP NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT terminal_operators_role_check
        CHECK (role IN ('MAINTENANCE_TECH', 'HOUSEKEEPER'))
);

CREATE INDEX IF NOT EXISTS idx_terminal_operators_username ON terminal_operators(username);
CREATE INDEX IF NOT EXISTS idx_terminal_operators_role_active ON terminal_operators(role, active);

COMMENT ON TABLE terminal_operators IS 'Operarios de terminales fijos (técnicos y camareras) sin wallet; autenticación por PIN corto.';

-- ============================================================================
-- 3. Wallets de operadores con roles on-chain
-- ============================================================================
-- Relaciona un operador del back-office con su dirección wallet y los roles
-- on-chain que posee en el contrato HotelOperations. El Owner/Administrador
-- puede registrarse como wallet de respaldo (OWNER_BACKUP) para emergencias.
CREATE TABLE IF NOT EXISTS operator_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    role VARCHAR(30) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP NULL,
    backup_for_role VARCHAR(30) NULL,
    CONSTRAINT operator_wallets_role_check
        CHECK (role IN ('HEAD_MAINTENANCE', 'HEAD_KEEPER', 'OWNER_BACKUP')),
    CONSTRAINT operator_wallets_backup_check
        CHECK (role <> 'OWNER_BACKUP' OR backup_for_role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_operator_wallets_username ON operator_wallets(username);
CREATE INDEX IF NOT EXISTS idx_operator_wallets_role_active ON operator_wallets(role, is_active);
CREATE INDEX IF NOT EXISTS idx_operator_wallets_backup ON operator_wallets(backup_for_role);
CREATE INDEX IF NOT EXISTS idx_operator_wallets_admin_user ON operator_wallets(admin_user_id);

-- ============================================================================
-- 4. Registro unificado de firmas on-chain
-- ============================================================================
CREATE TABLE IF NOT EXISTS on_chain_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    event_name VARCHAR(60) NOT NULL,
    content_hash VARCHAR(66) NOT NULL,
    signature TEXT NULL,
    signer_address VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error_message TEXT NULL,
    nonce VARCHAR(66) NULL,
    domain_hash VARCHAR(66) NULL,
    recovered_signer VARCHAR(42) NULL,
    verified_at TIMESTAMP NULL,
    role_snapshot VARCHAR(30) NULL,
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_attempt_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    deadline TIMESTAMP NULL,
    consumed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    mined_at TIMESTAMP NULL,
    CONSTRAINT on_chain_signatures_entity_check
        CHECK (entity_type IN ('ROOM_BLOCK', 'ROOM_UNBLOCK', 'INSPECTION', 'DAMAGE_CHARGE', 'PREVENTIVE_TASK', 'AREA_LOG', 'CONFIG')),
    CONSTRAINT on_chain_signatures_status_check
        CHECK (status IN ('PENDING', 'SIGNED', 'MINED', 'FAILED', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_entity ON on_chain_signatures(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_status ON on_chain_signatures(status, created_at);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_tx_hash ON on_chain_signatures(tx_hash);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_signer ON on_chain_signatures(signer_address);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_verified ON on_chain_signatures(status, verified_at);
-- Anti-replay (DT-AUD-04): un nonce de firma solo puede consumirse una vez por firmante.
CREATE UNIQUE INDEX IF NOT EXISTS uq_on_chain_signatures_nonce
    ON on_chain_signatures(signer_address, nonce) WHERE nonce IS NOT NULL;

-- ============================================================================
-- 5. Áreas comunes de mantenimiento
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance_area_types (
    code VARCHAR(40) PRIMARY KEY,
    name_es VARCHAR(80) NOT NULL,
    name_en VARCHAR(80) NOT NULL,
    name_ru VARCHAR(80) NOT NULL,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_type_code VARCHAR(40) NOT NULL REFERENCES maintenance_area_types(code) ON UPDATE CASCADE,
    name VARCHAR(120) NOT NULL,
    location_notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_areas_type ON maintenance_areas(area_type_code);
CREATE INDEX IF NOT EXISTS idx_maintenance_areas_active ON maintenance_areas(is_active);

CREATE TABLE IF NOT EXISTS maintenance_area_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES maintenance_areas(id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL,
    periodicity VARCHAR(20) NOT NULL,
    estimated_minutes INT NULL CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT maintenance_area_tasks_periodicity_check
        CHECK (periodicity IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_area_tasks_area ON maintenance_area_tasks(area_id);

CREATE TABLE IF NOT EXISTS maintenance_area_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES maintenance_area_tasks(id) ON DELETE CASCADE,
    performed_by VARCHAR(100) NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT NULL,
    evidence_path TEXT NULL,
    verified_by VARCHAR(100) NULL,
    verified_at TIMESTAMP NULL,
    signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_area_logs_task ON maintenance_area_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_area_logs_performed ON maintenance_area_logs(performed_at);

-- Semilla de tipos de área común
INSERT INTO maintenance_area_types (code, name_es, name_en, name_ru, is_critical, sort_order) VALUES
('POOL_FILTER',      'Filtro/Bomba de Piscina', 'Pool filter/pump', 'Фильтр/насос бассейна', TRUE,  1),
('GARDEN',           'Jardines',                'Gardens',          'Сады',                  FALSE, 2),
('WATER_PUMP',       'Bomba de agua',           'Water pump',       'Водяной насос',         TRUE,  3),
('PLUMBING',         'Plomería',                'Plumbing',         'Сантехника',            FALSE, 4),
('ELECTRICITY',      'Electricidad',            'Electricity',      'Электричество',         FALSE, 5),
('HVAC',             'Climatización',           'HVAC',             'Кондиционирование',     FALSE, 6),
('WASTE',            'Recolección de desechos', 'Waste collection', 'Вывоз мусора',          FALSE, 7),
('ELEVATOR',         'Ascensor',                'Elevator',         'Лифт',                  TRUE,  8),
('ELECTRIC_GENERATOR','Generador Eléctrico',    'Electric generator','Электрогенератор',     TRUE,  9),
('COMMON_BATHROOM',  'Baños comunes',           'Common bathrooms', 'Общие ванные комнаты',  FALSE, 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. Extensiones de maintenance_incidents
-- ============================================================================
ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES maintenance_areas(id) ON DELETE SET NULL;

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS reported_by_role VARCHAR(30) NULL;

-- H-30/D-C36: vocabulario cerrado del rol que reporta.
ALTER TABLE maintenance_incidents DROP CONSTRAINT IF EXISTS maintenance_incidents_reported_by_role_check;
ALTER TABLE maintenance_incidents
    ADD CONSTRAINT maintenance_incidents_reported_by_role_check
    CHECK (reported_by_role IS NULL OR reported_by_role IN
        ('RECEPTION', 'HEAD_KEEPER', 'HOUSEKEEPER', 'HEAD_MAINTENANCE', 'MAINTENANCE_TECH'));

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL;

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS damage_charge_cents BIGINT NULL CHECK (damage_charge_cents IS NULL OR damage_charge_cents > 0);

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS damage_charge_currency VARCHAR(3) NULL DEFAULT 'EUR';

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS damage_charge_approved_by VARCHAR(100) NULL;

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS block_signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL;

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS unblock_signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_area ON maintenance_incidents(area_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_block_sig ON maintenance_incidents(block_signature_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_unblock_sig ON maintenance_incidents(unblock_signature_id);

-- ============================================================================
-- 7. Extensiones de preventive_tasks
-- ============================================================================
ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100) NULL;

ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL;

ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL;

ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS evidence_path TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_preventive_tasks_signature ON preventive_tasks(signature_id);

-- ============================================================================
-- 8. Extensiones de preventive_plans para áreas comunes
-- ============================================================================
ALTER TABLE preventive_plans
    ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES maintenance_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preventive_plans_area ON preventive_plans(area_id);

-- ============================================================================
-- 9. Extensiones de rooms
-- ============================================================================
ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS maintenance_blocked_until DATE NULL;

ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS maintenance_blocked_reason VARCHAR(200) NULL;

ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS last_inspection_at TIMESTAMP NULL;

ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS last_inspection_result VARCHAR(12) NULL
        CHECK (last_inspection_result IS NULL OR last_inspection_result IN ('APPROVED', 'REJECTED'));

-- ============================================================================
-- 10. Housekeeping: inspecciones y cargos por daños
-- ============================================================================
CREATE TABLE IF NOT EXISTS housekeeping_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assignment_id UUID NULL REFERENCES housekeeping_assignments(id) ON DELETE SET NULL,
    inspected_by VARCHAR(100) NOT NULL,
    inspection_type VARCHAR(20) NOT NULL,
    result VARCHAR(12) NOT NULL,
    observations TEXT NULL,
    signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT housekeeping_inspections_type_check
        CHECK (inspection_type IN ('CHECKOUT', 'DAILY_SERVICE')),
    CONSTRAINT housekeeping_inspections_result_check
        CHECK (result IN ('APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_inspections_room ON housekeeping_inspections(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_inspections_assignment ON housekeeping_inspections(assignment_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_inspections_inspector ON housekeeping_inspections(inspected_by);

-- Auditoría de acciones off-chain de operadores (D-C21).
CREATE TABLE IF NOT EXISTS operator_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_username VARCHAR(100) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NULL,
    action VARCHAR(40) NOT NULL,
    old_value JSONB NULL,
    new_value JSONB NULL,
    terminal_id VARCHAR(100) NULL,
    prev_hash VARCHAR(66) NULL,
    integrity_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Append-only: se prohíbe UPDATE y DELETE sobre la auditoría (D-C31).
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'operator_audit_log es append-only: no se permite UPDATE ni DELETE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operator_audit_append_only ON operator_audit_log;
CREATE TRIGGER trg_operator_audit_append_only
    BEFORE UPDATE OR DELETE ON operator_audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

CREATE INDEX IF NOT EXISTS idx_operator_audit_actor ON operator_audit_log(actor_username, created_at);

CREATE TABLE IF NOT EXISTS housekeeping_damage_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charge_id UUID NOT NULL REFERENCES additional_charges(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    token_id VARCHAR(66) NULL REFERENCES nfts(token_id) ON DELETE SET NULL,
    inspection_id UUID NULL REFERENCES housekeeping_inspections(id) ON DELETE SET NULL,
    reported_by VARCHAR(100) NOT NULL,
    damage_description TEXT NOT NULL,
    evidence_path TEXT NULL,
    approved_by VARCHAR(100) NOT NULL,
    -- D-C27: el cargo por daños NO exige firma on-chain; se audita off-chain.
    signature_id UUID NULL REFERENCES on_chain_signatures(id) ON DELETE SET NULL,
    audit_log_id UUID NULL REFERENCES operator_audit_log(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_charge ON housekeeping_damage_charges(charge_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_room ON housekeeping_damage_charges(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_token ON housekeeping_damage_charges(token_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_signature ON housekeeping_damage_charges(signature_id);


CREATE INDEX IF NOT EXISTS idx_operator_audit_entity ON operator_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_operator_audit_action ON operator_audit_log(action, created_at);

COMMENT ON TABLE operator_audit_log IS 'Auditoría de acciones off-chain de operadores (trazabilidad e investigación).';


-- ----------------------------------------------------------------------------
-- 12. Vocabulario canónico de estados (decisión A, 2026-10-06)
-- ----------------------------------------------------------------------------
-- El SQL es la fuente de verdad. Los casos de uso y el documento técnico usan
-- EXACTAMENTE estos valores.

-- rooms.publication_status: se mantiene (DRAFT, PUBLISHED, PAUSED, MAINTENANCE, OUT_OF_SERVICE).
-- 'AVAILABLE' NO existe: el estado publicable es 'PUBLISHED'.
-- rooms.operational_status: se añade IN_INSPECTION a los ya existentes.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_operational_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_operational_status_check
    CHECK (operational_status IN ('CLEAN', 'DIRTY', 'OCCUPIED', 'PENDING_CLEANING', 'IN_INSPECTION'));

-- housekeeping_assignments.status: PENDING, IN_PROGRESS, DONE (una inspección
-- rechazada devuelve la asignación a PENDING para retrabajo; NO existe REJECTED).
-- preventive_tasks: la validación del jefe se modela con validation_status.
ALTER TABLE preventive_tasks
    ADD COLUMN IF NOT EXISTS validation_status VARCHAR(30) NULL;

ALTER TABLE preventive_tasks DROP CONSTRAINT IF EXISTS preventive_tasks_validation_status_check;
ALTER TABLE preventive_tasks
    ADD CONSTRAINT preventive_tasks_validation_status_check
    CHECK (validation_status IS NULL OR validation_status IN
        ('PENDING_VERIFICATION', 'VALIDATED', 'PENDING_VERIFICATION_EXPIRED'));

-- Alertas de suministros (D-C33, CU-V-25): estado abierto/cerrado y recordatorio.
CREATE TABLE IF NOT EXISTS supply_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_item_id UUID NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_reminded_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_supply_alerts_item ON supply_alerts(supply_item_id, status);

COMMENT ON TABLE supply_alerts IS 'Alertas de stock por debajo del umbral (D-C33): estado abierto/cerrado y recordatorio diario.';

-- ============================================================================
-- 11. Comentarios para documentación en psql
-- ============================================================================
COMMENT ON TABLE operator_wallets IS 'Wallets asignadas a jefes con roles on-chain (HEAD_MAINTENANCE, HEAD_KEEPER).';
COMMENT ON TABLE on_chain_signatures IS 'Registro unificado de firmas on-chain de movimientos operativos críticos.';
COMMENT ON TABLE maintenance_area_types IS 'Catálogo de áreas comunes de mantenimiento (piscina, jardines, electricidad, etc.).';
COMMENT ON TABLE maintenance_areas IS 'Instancias concretas de áreas comunes del hotel.';
COMMENT ON TABLE maintenance_area_tasks IS 'Tareas rutinarias programadas por área común.';
COMMENT ON TABLE maintenance_area_logs IS 'Ejecución y verificación de tareas rutinarias de áreas comunes.';
COMMENT ON TABLE housekeeping_inspections IS 'Inspecciones post-limpieza realizadas por el Ama de llaves.';
COMMENT ON TABLE housekeeping_damage_charges IS 'Cargos por daños a habitación, vinculados a additional_charges y firmados on-chain.';
-- H-15: evidence_path apunta a almacenamiento cifrado; se elimina EXIF/GPS al subir y se sirve con URL firmada temporal.

-- Notificación al huésped por cargos por daños (D-C14).
CREATE TABLE IF NOT EXISTS damage_charge_guest_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    damage_charge_id UUID NOT NULL REFERENCES housekeeping_damage_charges(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP NULL,
    due_date TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    dispute_notes TEXT NULL,
    disputed_at TIMESTAMP NULL,
    resolved_by VARCHAR(100) NULL,
    resolved_at TIMESTAMP NULL,
    CONSTRAINT damage_charge_notifications_channel_check
        CHECK (channel IN ('EMAIL', 'TELEGRAM', 'WEB')),
    -- CU-AUD-05: ACKNOWLEDGED = huésped conforme sin reclamación; la resolución
    -- de una reclamación usa los estados nuevos RESOLVED_ACCEPTED / RESOLVED_REJECTED.
    CONSTRAINT damage_charge_notifications_status_check
        CHECK (status IN ('PENDING', 'SENT', 'ACKNOWLEDGED', 'DISPUTED', 'EXPIRED',
                          'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_damage_charge_notifications_charge ON damage_charge_guest_notifications(damage_charge_id);
CREATE INDEX IF NOT EXISTS idx_damage_charge_notifications_status ON damage_charge_guest_notifications(status);

COMMENT ON TABLE damage_charge_guest_notifications IS 'Notificación al huésped por cargos por daños, plazo de reclamación y resolución.';

`;

/**
 * Ejecuta la creación del esquema y sus índices si no existen.
 */
export async function runMigrations(customPool?: Pool): Promise<void> {
  const pool = customPool || getDbPool();
  await pool.query(INITIAL_SCHEMA_SQL);
}

/**
 * Purga de notificaciones enviadas con antigüedad superior a `daysThreshold` (por defecto 90 días, ID_V-22).
 */
export async function purgeOldNotifications(
  daysThreshold = 90,
  customPool?: Pool,
): Promise<number> {
  const pool = customPool || getDbPool();
  const result = await pool.query(
    `DELETE FROM email_notifications 
     WHERE status = 'SENT' 
       AND created_at < NOW() - ($1 || ' days')::INTERVAL`,
    [daysThreshold],
  );
  return result.rowCount ?? 0;
}

/**
 * Reinicia la base de datos eliminando las tablas (exclusivo para tests o staging).
 */
export async function resetDatabase(customPool?: Pool): Promise<void> {
  const pool = customPool || getDbPool();
  await pool.query(`
    -- vNext (F1): primero las 12 tablas nuevas, en orden inverso de FK.
    DROP TABLE IF EXISTS damage_charge_guest_notifications CASCADE;
    DROP TABLE IF EXISTS housekeeping_damage_charges CASCADE;
    DROP TABLE IF EXISTS housekeeping_inspections CASCADE;
    DROP TABLE IF EXISTS supply_alerts CASCADE;
    DROP TABLE IF EXISTS maintenance_area_logs CASCADE;
    DROP TABLE IF EXISTS maintenance_area_tasks CASCADE;
    DROP TABLE IF EXISTS maintenance_areas CASCADE;
    DROP TABLE IF EXISTS maintenance_area_types CASCADE;
    DROP TABLE IF EXISTS operator_wallets CASCADE;
    DROP TABLE IF EXISTS terminal_operators CASCADE;
    DROP TABLE IF EXISTS on_chain_signatures CASCADE;
    DROP TABLE IF EXISTS operator_audit_log CASCADE;
    DROP TABLE IF EXISTS hotel_offers CASCADE;
    DROP TABLE IF EXISTS hotel_images CASCADE;
    DROP TABLE IF EXISTS preventive_tasks CASCADE;
    DROP TABLE IF EXISTS preventive_plans CASCADE;
    DROP TABLE IF EXISTS maintenance_incident_events CASCADE;
    DROP TABLE IF EXISTS maintenance_incidents CASCADE;
    DROP TABLE IF EXISTS supply_stock_movements CASCADE;
    DROP TABLE IF EXISTS supply_items CASCADE;
    DROP TABLE IF EXISTS housekeeping_room_logs CASCADE;
    DROP TABLE IF EXISTS housekeeping_assignments CASCADE;
    DROP TABLE IF EXISTS housekeeping_shifts CASCADE;
    DROP TABLE IF EXISTS activity_bookings CASCADE;
    DROP TABLE IF EXISTS activity_schedules CASCADE;
    DROP TABLE IF EXISTS activities CASCADE;
    DROP TABLE IF EXISTS folios CASCADE;
    DROP TABLE IF EXISTS reservation_status_history CASCADE;
    DROP TABLE IF EXISTS reservation_contacts CASCADE;
    DROP TABLE IF EXISTS reservation_nights CASCADE;
    DROP TABLE IF EXISTS reservations CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS room_status_history CASCADE;
    DROP TABLE IF EXISTS room_publications CASCADE;
    DROP TABLE IF EXISTS room_amenity_links CASCADE;
    DROP TABLE IF EXISTS room_amenities CASCADE;
    DROP TABLE IF EXISTS room_images CASCADE;
    DROP TABLE IF EXISTS rooms CASCADE;
    DROP TABLE IF EXISTS room_types CASCADE;
    DROP TABLE IF EXISTS platform_settings CASCADE;
    DROP TABLE IF EXISTS worker_sale_history CASCADE;
    DROP TABLE IF EXISTS worker_aggregate_counters CASCADE;
    DROP TABLE IF EXISTS worker_processed_logs CASCADE;
    DROP TABLE IF EXISTS worker_checkpoints CASCADE;
    DROP TABLE IF EXISTS email_notifications CASCADE;
    DROP TABLE IF EXISTS push_subscriptions CASCADE;
    DROP TABLE IF EXISTS checkin_contingency_logs CASCADE;
    DROP TABLE IF EXISTS checkout_incidents CASCADE;
    DROP TABLE IF EXISTS stay_checkouts CASCADE;
    DROP TABLE IF EXISTS additional_charges CASCADE;
    DROP TABLE IF EXISTS mfa_recovery_codes CASCADE;
    DROP TABLE IF EXISTS admin_sessions CASCADE;
    DROP TABLE IF EXISTS admin_users CASCADE;
    DROP TABLE IF EXISTS sale_events CASCADE;
    DROP TABLE IF EXISTS listings CASCADE;
    DROP TABLE IF EXISTS nfts CASCADE;
  `);
  await runMigrations(pool);
}
