# Diccionario de datos — Propuesta vNext (Mantenimiento + Ama de llaves)

> **Alcance:** extensiones y nuevas tablas necesarias para soportar los roles de **Jefe de Mantenimiento** y **Ama de llaves** con firma on-chain selectiva.  
> **Base:** parte del esquema actual de `RepoTecnico/diccionario_datos.md` (44 tablas, §2–§3.11).  
> **Sincronizado con:** `RepoTecnico/propuesta_vNext/diagrama_er.md` y `RepoTecnico/propuesta_vNext/base_datos.sql`.  
> **Fecha:** 2026-10-06.

---

## 1. Convenciones

Se mantienen las del proyecto actual:

| Convención | Regla |
|---|---|
| Identificadores internos | `UUID` vía `gen_random_uuid()` |
| Direcciones blockchain | `VARCHAR(42)`, con `0x` |
| Hashes de tx | `VARCHAR(66)` |
| Importes off-chain | `BIGINT` en céntimos |
| Marcas de tiempo | `TIMESTAMP` UTC; la zona `Europe/Madrid` se aplica en presentación |
| Identificadores de cadena | `VARCHAR(66)` para `token_id` |
| Roles de operador | `VARCHAR(30)` con vocabulario cerrado en la capa de dominio |

---

## 1.5 `terminal_operators` — usuarios de terminales fijos (PIN)

Técnicos y camareras no usan wallet ni el login completo del back-office. Se identifican en el terminal fijo con un **PIN corto** (D-C8). La tabla se vincula lógicamente con los registros de tareas y asignaciones por `username`.

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `username` | `VARCHAR(100)` | no, único | — | Identificador corto en el terminal |
| `full_name` | `VARCHAR(100)` | no | — | Nombre completo del operario |
| `role` | `VARCHAR(30)` | no | — | `MAINTENANCE_TECH` · `HOUSEKEEPER` |
| `pin_hash` | `TEXT` | no | — | Hash bcrypt del PIN |
| `active` | `BOOLEAN` | no | `TRUE` | Alta/baja |
| `created_by` | `VARCHAR(100)` | no | — | Jefe/admin que da de alta |
| `created_at` / `updated_at` | `TIMESTAMP` | no | `NOW()` | — |

Índices: `(username)`, `(role, active)`.

> **Nota:** las tablas `maintenance_area_logs.performed_by`, `housekeeping_assignments.assignee`, `preventive_tasks.completed_by` y similares aceptan el `username` de `terminal_operators` para acciones ejecutadas desde el terminal.

---

## 2. Roles extendidos en `admin_users`

La tabla `admin_users` del sistema actual se extiende con nuevos valores para `role`:

| Valor propuesto | Descripción | ¿Requiere wallet? |
|---|---|---|
| `HEAD_MAINTENANCE` | Jefe de Mantenimiento | Sí |
| `HEAD_KEEPER` | Ama de llaves / Jefa de camareras | Sí |
| `MAINTENANCE_TECH` | Técnico de mantenimiento a cargo del jefe | No |
| `HOUSEKEEPER` | Camarera/mucama a cargo del ama de llaves | No |

> Los valores actuales (`DEFAULT_ADMIN_ROLE`, `RECEPTION_ROLE`, `HOUSEKEEPING`, `MAINTENANCE`) se mantienen por compatibilidad. Se recomienda migrar `HOUSEKEEPING` → `HEAD_KEEPER` y `MAINTENANCE` → `HEAD_MAINTENANCE` donde el usuario actual tuviera wallet.

---

## 3. Nuevas tablas

### 3.1 `operator_wallets` — wallets asignadas a operadores con roles on-chain

Relaciona un operador del back-office con su dirección wallet y los roles on-chain que posee en el contrato `HotelOperations`. El Owner/Administrador (`DEFAULT_ADMIN_ROLE`) puede actuar como wallet de respaldo para operaciones críticas de mantenimiento en emergencias.

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `username` | `VARCHAR(100)` | no, único | — | FK lógica a `admin_users.username` |
| `role` | `VARCHAR(30)` | no | — | `HEAD_MAINTENANCE` · `HEAD_KEEPER` · `OWNER_BACKUP` |
| `wallet_address` | `VARCHAR(42)` | no, único | — | Dirección de la wallet |
| `is_active` | `BOOLEAN` | no | `TRUE` | ¿Wallet vigente? |
| `assigned_by` | `VARCHAR(100)` | no | — | Administrador que asignó la wallet |
| `assigned_at` | `TIMESTAMP` | no | `NOW()` | — |
| `revoked_at` | `TIMESTAMP` | sí | — | Fecha de revocación |
| `backup_for_role` | `VARCHAR(30)` | sí | — | Si `role = OWNER_BACKUP`, indica para qué rol es respaldo (`HEAD_MAINTENANCE` / `HEAD_KEEPER`) |

Índices: `(username)`, `(wallet_address)`, `(role, is_active)`, `(backup_for_role)`.

---

### 3.2 `on_chain_signatures` — registro de firmas de movimientos operativos

Registro unificado de todas las firmas on-chain generadas por los jefes, tanto las confirmadas como las pendientes/fallidas.

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `entity_type` | `VARCHAR(40)` | no | — | Tipo de entidad firmada: `ROOM_BLOCK`, `ROOM_UNBLOCK`, `INSPECTION`, `DAMAGE_CHARGE`, `PREVENTIVE_TASK` |
| `entity_id` | `UUID` | no | — | Id de la entidad concreta |
| `event_name` | `VARCHAR(60)` | no | — | Nombre del evento en `HotelOperations` |
| `content_hash` | `VARCHAR(66)` | no | — | `keccak256` de los datos firmados |
| `signature` | `TEXT` | sí | — | Firma EIP-191/EIP-712 |
| `signer_address` | `VARCHAR(42)` | no | — | Wallet que firmó |
| `tx_hash` | `VARCHAR(66)` | sí | — | Hash de la tx on-chain una vez minada |
| `status` | `VARCHAR(20)` | no | `'PENDING'` | `PENDING` · `SIGNED` · `MINED` · `FAILED` · `REVOKED` |
| `error_message` | `TEXT` | sí | — | Mensaje de error si falló |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |
| `mined_at` | `TIMESTAMP` | sí | — | — |

Índices: `(entity_type, entity_id)`, `(status, created_at)`, `(tx_hash)`, `(signer_address)`.

---

### 3.3 `maintenance_area_types` — catálogo de áreas comunes

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `code` | `VARCHAR(40)` | PK | — | `POOL`, `GARDEN`, `WATER_PUMP`, `PLUMBING`, `ELECTRICITY`, `HVAC`, `WASTE`, `COMMON_BATHROOM`, `ELEVATOR`, etc. |
| `name_es` / `name_en` / `name_ru` | `VARCHAR(80)` | no | — | Nombres trilingües |
| `is_critical` | `BOOLEAN` | no | `FALSE` | ¿Requiere firma on-chain su verificación? |
| `sort_order` | `INT` | no | `0` | — |

Semilla propuesta: `POOL`, `GARDEN`, `WATER_PUMP`, `PLUMBING`, `ELECTRICITY`, `HVAC`, `WASTE`, `ELEVATOR`, `COMMON_BATHROOM`.

---

### 3.4 `maintenance_areas` — instancias de áreas comunes del hotel

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `area_type_code` | `VARCHAR(40)` | no | — | FK a `maintenance_area_types(code)` |
| `name` | `VARCHAR(120)` | no | — | Nombre específico (p. ej. «Piscina principal») |
| `location_notes` | `TEXT` | sí | — | Ubicación/descripción |
| `is_active` | `BOOLEAN` | no | `TRUE` | — |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

---

### 3.5 `maintenance_area_tasks` — tareas rutinarias por área

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `area_id` | `UUID` | no | — | FK a `maintenance_areas(id)` |
| `label` | `VARCHAR(200)` | no | — | Descripción de la tarea |
| `periodicity` | `VARCHAR(20)` | no | — | `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `ANNUAL` |
| `estimated_minutes` | `INT` | sí | — | Duración estimada |
| `is_active` | `BOOLEAN` | no | `TRUE` | — |
| `created_by` | `VARCHAR(100)` | no | — | — |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

---

### 3.6 `maintenance_area_logs` — ejecución de tareas rutinarias

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `task_id` | `UUID` | no | — | FK a `maintenance_area_tasks(id)` |
| `performed_by` | `VARCHAR(100)` | no | — | Técnico/camarera que ejecutó |
| `performed_at` | `TIMESTAMP` | no | — | Fecha/hora de ejecución |
| `notes` | `TEXT` | sí | — | Observaciones |
| `evidence_path` | `TEXT` | sí | — | Ruta de foto/evidencia |
| `verified_by` | `VARCHAR(100)` | sí | — | Jefe que verifica |
| `verified_at` | `TIMESTAMP` | sí | — | — |
| `signature_id` | `UUID` | sí | — | FK a `on_chain_signatures(id)` si aplica |

---

### 3.7 `maintenance_incidents` — extensión de la tabla existente

La tabla actual (`RepoTecnico/diccionario_datos.md` §3.10) se amplía:

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `room_id` | `UUID` | sí | — | FK a `rooms(id)`; `NULL` si es área común |
| `area_id` | `UUID` | sí | — | FK a `maintenance_areas(id)`; `NULL` si es habitación |
| `kind` | `VARCHAR(40)` | no | — | Tipo de avería |
| `description` | `TEXT` | sí | — | Descripción |
| `priority` | `VARCHAR(10)` | no | — | `LOW` · `MEDIUM` · `HIGH` |
| `status` | `VARCHAR(12)` | no | — | `OPEN` · `IN_PROGRESS` · `RESOLVED` · `CANCELLED` |
| `blocks_sale` | `BOOLEAN` | no | `TRUE` | Si `TRUE`, la habitación no se vende |
| `reported_by` | `VARCHAR(100)` | no | — | Usuario que reporta |
| `reported_by_role` | `VARCHAR(30)` | no | — | `RECEPTION`, `HEAD_KEEPER`, `HOUSEKEEPER`, `HEAD_MAINTENANCE` |
| `assigned_to` | `VARCHAR(100)` | sí | — | Técnico asignado |
| `resolved_by` | `VARCHAR(100)` | sí | — | — |
| `resolved_at` | `TIMESTAMP` | sí | — | — |
| `resolution_notes` | `TEXT` | sí | — | — |
| `damage_charge_cents` | `BIGINT` | sí | — | Cargo por daños (si aplica) |
| `damage_charge_currency` | `VARCHAR(3)` | sí | `'EUR'` | — |
| `damage_charge_approved_by` | `VARCHAR(100)` | sí | — | — |
| `block_signature_id` | `UUID` | sí | — | Firma del bloqueo de habitación |
| `unblock_signature_id` | `UUID` | sí | — | Firma del desbloqueo |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

Restricción: exactamente uno de `room_id` o `area_id` debe ser no nulo.

---

### 3.8 `preventive_tasks` — extensión de la tabla existente

Se añaden campos para firma y verificación:

| Campo adicional | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `verified_by` | `VARCHAR(100)` | sí | — | Jefe de Mantenimiento que verifica |
| `verified_at` | `TIMESTAMP` | sí | — | — |
| `requires_signature` | `BOOLEAN` | no | `FALSE` | ¿Requiere firma on-chain? |
| `signature_id` | `UUID` | sí | — | FK a `on_chain_signatures(id)` |
| `evidence_path` | `TEXT` | sí | — | Foto/evidencia de cumplimiento |

---

### 3.9 `housekeeping_inspections` — inspecciones del Ama de llaves

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `room_id` | `UUID` | no | — | FK a `rooms(id)` |
| `assignment_id` | `UUID` | sí | — | FK a `housekeeping_assignments(id)` |
| `inspected_by` | `VARCHAR(100)` | no | — | Ama de llaves |
| `inspection_type` | `VARCHAR(20)` | no | — | `CHECKOUT`, `DAILY_SERVICE` |
| `result` | `VARCHAR(12)` | no | — | `APPROVED` · `REJECTED` |
| `observations` | `TEXT` | sí | — | — |
| `signature_id` | `UUID` | sí | — | FK a `on_chain_signatures(id)` |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

---

### 3.10 `housekeeping_damage_charges` — cargos por daños

Vincula un cargo por daños con el registro off-chain y la firma on-chain.

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `charge_id` | `UUID` | no | — | FK a `additional_charges(id)` |
| `room_id` | `UUID` | no | — | FK a `rooms(id)` |
| `token_id` | `VARCHAR(66)` | sí | — | FK a `nfts(token_id)`; noche/token vendido al que se imputa el daño (D-C4) |
| `inspection_id` | `UUID` | sí | — | FK a `housekeeping_inspections(id)` |
| `reported_by` | `VARCHAR(100)` | no | — | — |
| `damage_description` | `TEXT` | no | — | — |
| `evidence_path` | `TEXT` | sí | — | Foto del daño |
| `approved_by` | `VARCHAR(100)` | no | — | Ama de llaves que aprueba el cargo |
| `signature_id` | `UUID` | no | — | FK a `on_chain_signatures(id)` |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

---


### 3.10.1 `damage_charge_guest_notifications` — notificación al huésped por cargos por daños (D-C14)

Registra el envío de la notificación al huésped cuando se aprueba un cargo por daños, el plazo para reclamar y la resolución de la reclamación.

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `damage_charge_id` | `UUID` | no | — | FK a `housekeeping_damage_charges(id)` |
| `channel` | `VARCHAR(20)` | no | — | `EMAIL` · `TELEGRAM` · `WEB` |
| `sent_at` | `TIMESTAMP` | sí | — | Momento del envío |
| `due_date` | `TIMESTAMP` | no | — | Fecha límite para reclamar |
| `status` | `VARCHAR(20)` | no | `'PENDING'` | `PENDING` · `SENT` · `ACKNOWLEDGED` · `DISPUTED` · `EXPIRED` |
| `dispute_notes` | `TEXT` | sí | — | Notas de la reclamación del huésped |
| `disputed_at` | `TIMESTAMP` | sí | — | — |
| `resolved_by` | `VARCHAR(100)` | sí | — | Recepción/Admin que resuelve la reclamación |
| `resolved_at` | `TIMESTAMP` | sí | — | — |

---

### 3.11 `rooms` — campos adicionales

Se añaden campos operativos a la tabla `rooms` existente:

| Campo adicional | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `maintenance_blocked_until` | `DATE` | sí | — | Fecha hasta la que la habitación permanece bloqueada |
| `maintenance_blocked_reason` | `VARCHAR(200)` | sí | — | Motivo del bloqueo |
| `last_inspection_at` | `TIMESTAMP` | sí | — | Última inspección del ama de llaves |
| `last_inspection_result` | `VARCHAR(12)` | sí | — | `APPROVED` · `REJECTED` |

---

## 4. Contrato `HotelOperations.sol` (resumen)

Aunque el diccionario de datos es off-chain, se lista el estado/events propuesto para coherencia con `base_datos.sql` y `diagrama_er.md`.

### Roles on-chain

- `HEAD_MAINTENANCE_ROLE`
- `HEAD_KEEPER_ROLE`

### Eventos

| Evento | Parámetros | Descripción |
|---|---|---|
| `RoomBlocked` | `roomNumber, reason, until, signer, timestamp` | Habitación bloqueada por mantenimiento |
| `RoomUnblocked` | `roomNumber, signer, timestamp` | Habitación desbloqueada |
| `HousekeepingInspected` | `roomNumber, inspectionType, result, signer, timestamp` | Inspección certificada |
| `DamageChargeRecorded` | `chargeId, roomNumber, amountCents, currency, signer, timestamp` | Cargo por daños |
| `PreventiveTaskVerified` | `taskId, planCode, signer, timestamp` | Tarea preventiva verificada |

---

*Diccionario vNext · @asistenteProyecto.*
