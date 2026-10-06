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
CREATE TABLE IF NOT EXISTS operator_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    role VARCHAR(30) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP NULL,
    CONSTRAINT operator_wallets_role_check
        CHECK (role IN ('HEAD_MAINTENANCE', 'HEAD_KEEPER'))
);

CREATE INDEX IF NOT EXISTS idx_operator_wallets_username ON operator_wallets(username);
CREATE INDEX IF NOT EXISTS idx_operator_wallets_role_active ON operator_wallets(role, is_active);

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
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    mined_at TIMESTAMP NULL,
    CONSTRAINT on_chain_signatures_entity_check
        CHECK (entity_type IN ('ROOM_BLOCK', 'ROOM_UNBLOCK', 'INSPECTION', 'DAMAGE_CHARGE', 'PREVENTIVE_TASK')),
    CONSTRAINT on_chain_signatures_status_check
        CHECK (status IN ('PENDING', 'SIGNED', 'MINED', 'FAILED', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_entity ON on_chain_signatures(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_status ON on_chain_signatures(status, created_at);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_tx_hash ON on_chain_signatures(tx_hash);
CREATE INDEX IF NOT EXISTS idx_on_chain_signatures_signer ON on_chain_signatures(signer_address);

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
('POOL',        'Piscina',          'Pool',         'Бассейн',      TRUE,  1),
('GARDEN',      'Jardines',         'Gardens',      'Сады',         FALSE, 2),
('WATER_PUMP',  'Bomba de agua',    'Water pump',   'Водяной насос', TRUE,  3),
('PLUMBING',    'Plomería',         'Plumbing',     'Сантехника',   TRUE,  4),
('ELECTRICITY', 'Electricidad',     'Electricity',  'Электричество', TRUE,  5),
('HVAC',        'Climatización',    'HVAC',         'Кондиционирование', TRUE, 6),
('WASTE',       'Recolección de desechos', 'Waste collection', 'Вывоз мусора', FALSE, 7),
('ELEVATOR',    'Ascensor',         'Elevator',     'Лифт',         TRUE,  8),
('COMMON_BATHROOM', 'Baños comunes', 'Common bathrooms', 'Общие ванные комнаты', FALSE, 9)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. Extensiones de maintenance_incidents
-- ============================================================================
ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES maintenance_areas(id) ON DELETE SET NULL;

ALTER TABLE maintenance_incidents
    ADD COLUMN IF NOT EXISTS reported_by_role VARCHAR(30) NULL;

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
    signature_id UUID NOT NULL REFERENCES on_chain_signatures(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_charge ON housekeeping_damage_charges(charge_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_room ON housekeeping_damage_charges(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_token ON housekeeping_damage_charges(token_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_damage_charges_signature ON housekeeping_damage_charges(signature_id);

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

-- ============================================================================
-- Fin del script vNext
-- ============================================================================
