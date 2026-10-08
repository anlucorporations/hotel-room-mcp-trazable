-- ============================================================================
-- base_datos.sql — Propuesta vNext: Mantenimiento + Ama de llaves
-- ============================================================================
-- Propósito : script de creación/actualización idempotente para las tablas
--             y extensiones necesarias en la vNext del proyecto.
--             PARTE del esquema actual: asume que las tablas base de
--             RepoTecnico/base_datos.sql ya existen.
-- Versión   : 1.0.0
-- Fecha     : 2026-10-06
-- Motor     : PostgreSQL 14+ (requiere pgcrypto)
-- Uso       : psql -f RepoTecnico/propuesta_vNext/base_datos.sql
--
-- Changelog
--   1.0.0 (2026-10-06) · Creación inicial: roles extendidos, wallets de
--     operadores, registro de firmas on-chain, áreas comunes, tareas rutinarias,
--     extensiones de maintenance_incidents/preventive_tasks, inspecciones y
--     cargos por daños del ama de llaves.
--
-- Idempotencia
--   · CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   · ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
--   · INSERT ... ON CONFLICT DO NOTHING para semillas.
-- ============================================================================

-- ============================================================================
-- 1. Extensiones
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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


-- ============================================================================
-- Fin del script vNext
-- ============================================================================
