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
-- Versión   : 1.0.0
-- Fecha     : 2026-09-26
-- Motor     : PostgreSQL 14+ (requiere la extensión pgcrypto)
-- Uso       : psql -f RepoTecnico/base_datos.sql
--
-- Changelog
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

-- ============================================================================
-- 5. Datos semilla mínimos (reejecutables)
-- ============================================================================

-- Fila única de agregados del worker (id = 0 por CHECK). Necesaria para que el
-- worker pueda hacer SELECT ... FOR UPDATE desde el primer arranque.
INSERT INTO worker_aggregate_counters (id) VALUES (0) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. Comentarios (COMMENT ON)
-- ============================================================================
-- Se documentan las 16 tablas y todas sus columnas. Reejecutable: COMMENT ON
-- reemplaza el valor anterior.

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
COMMENT ON COLUMN admin_users.role IS 'DEFAULT_ADMIN_ROLE · RECEPTION_ROLE';
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

-- ============================================================================
-- Fin de base_datos.sql
-- ============================================================================
