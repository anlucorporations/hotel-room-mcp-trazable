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
-- El rol es uno de los que gobiernan el back-office (DEFAULT_ADMIN_ROLE | RECEPTION_ROLE).
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
