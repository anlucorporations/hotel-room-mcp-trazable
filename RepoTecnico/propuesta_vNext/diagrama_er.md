# Diagrama entidad-relación — Propuesta vNext (Mantenimiento + Ama de llaves)

> **Alcance:** modela solo las **extensiones y nuevas entidades** de la propuesta vNext.  
> **Base:** se integra con las tablas existentes del proyecto (`rooms`, `admin_users`, `additional_charges`, `housekeeping_assignments`, `maintenance_incidents`, `preventive_plans`, `preventive_tasks`).  
> **Sincronizado con:** `RepoTecnico/propuesta_vNext/diccionario_datos.md` y `RepoTecnico/propuesta_vNext/base_datos.sql`.  
> **Fecha:** 2026-10-06.

---

## 1. Roles, wallets y firmas on-chain

```mermaid
erDiagram
    admin_users {
        UUID id PK
        VARCHAR(100) username UK
        TEXT password_hash
        TEXT totp_secret_enc
        VARCHAR(30) role "DEFAULT_ADMIN_ROLE · RECEPTION_ROLE · HEAD_MAINTENANCE · HEAD_KEEPER · MAINTENANCE_TECH · HOUSEKEEPING"
        BOOLEAN active
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    terminal_operators {
        UUID id PK
        VARCHAR(100) username UK "Identificador en terminal fijo"
        VARCHAR(100) full_name
        VARCHAR(30) role "MAINTENANCE_TECH · HOUSEKEEPER"
        TEXT pin_hash "bcrypt del PIN corto"
        TIMESTAMP pin_changed_at "Rotación cada 90 días"
        BOOLEAN must_change_pin "PIN de un solo uso inicial"
        INT failed_attempts "Bloqueo a los 5 fallos"
        TIMESTAMP locked_until "Bloqueo temporal"
        BOOLEAN active
        VARCHAR(100) created_by
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    operator_wallets {
        UUID id PK
        UUID admin_user_id FK "FK a admin_users(id)"
        VARCHAR(100) username UK"
        VARCHAR(30) role "HEAD_MAINTENANCE · HEAD_KEEPER · OWNER_BACKUP"
        VARCHAR(42) wallet_address UK
        BOOLEAN is_active
        VARCHAR(100) assigned_by
        TIMESTAMP assigned_at
        TIMESTAMP revoked_at
        VARCHAR(30) backup_for_role "Si es OWNER_BACKUP"
    }

    on_chain_signatures {
        UUID id PK
        VARCHAR(40) entity_type "ROOM_BLOCK · ROOM_UNBLOCK · INSPECTION · DAMAGE_CHARGE · PREVENTIVE_TASK · AREA_LOG · CONFIG"
        UUID entity_id
        VARCHAR(60) event_name
        VARCHAR(66) content_hash
        TEXT signature
        VARCHAR(42) signer_address
        VARCHAR(66) tx_hash
        VARCHAR(20) status "PENDING · SIGNED · MINED · FAILED · REVOKED"
        TEXT error_message
        VARCHAR(66) nonce "Nonce EIP-712"
        VARCHAR(66) domain_hash "Hash del dominio EIP-712"
        VARCHAR(42) recovered_signer "Dirección recuperada de la firma"
        TIMESTAMP verified_at "Momento de verificación criptográfica"
        VARCHAR(30) role_snapshot "Rol del firmante en el momento de firmar"
        INT retry_count "Reintentos de anclaje (máx. 8)"
        TIMESTAMP next_attempt_at "Backoff exponencial"
        TIMESTAMP expires_at "TTL en cola (24 h)"
        TIMESTAMP deadline "Caducidad de la firma"
        TIMESTAMP consumed_at "Consumo del nonce"
        TIMESTAMP created_at
        TIMESTAMP mined_at
    }

    operator_audit_log {
        UUID id PK
        VARCHAR(100) actor_username
        VARCHAR(30) actor_role
        VARCHAR(40) entity_type
        UUID entity_id
        VARCHAR(40) action "CREATE · UPDATE · DELETE · ASSIGN · RESOLVE · LOGIN"
        JSONB old_value
        JSONB new_value
        VARCHAR(100) terminal_id
        VARCHAR(66) prev_hash "Hash del registro anterior"
        VARCHAR(66) integrity_hash "keccak256 del registro + prev_hash"
        TIMESTAMP created_at
    }

    admin_users ||--o| operator_wallets : "posee"
    admin_users ||--o{ terminal_operators : "da de alta"
    on_chain_signatures ||--o| maintenance_incidents : "bloquea/desbloquea"
    on_chain_signatures ||--o| housekeeping_inspections : "certifica"
    on_chain_signatures ||--o| housekeeping_damage_charges : "aprueba cargo"
    on_chain_signatures ||--o| preventive_tasks : "verifica"
    on_chain_signatures ||--o| maintenance_area_logs : "verifica"
```

---

## 2. Áreas comunes y mantenimiento rutinario

```mermaid
erDiagram
    maintenance_area_types {
        VARCHAR(40) code PK "POOL_FILTER · WATER_PUMP · ELEVATOR · ELECTRIC_GENERATOR (críticos) · GARDEN · PLUMBING · ELECTRICITY · HVAC · WASTE · COMMON_BATHROOM"
        VARCHAR(80) name_es
        VARCHAR(80) name_en
        VARCHAR(80) name_ru
        BOOLEAN is_critical
        INT sort_order
    }

    maintenance_areas {
        UUID id PK
        VARCHAR(40) area_type_code FK "FK a maintenance_area_types(code)"
        VARCHAR(120) name
        TEXT location_notes
        BOOLEAN is_active
        TIMESTAMP created_at
    }

    maintenance_area_tasks {
        UUID id PK
        UUID area_id FK "FK a maintenance_areas(id)"
        VARCHAR(200) label
        VARCHAR(20) periodicity "DAILY · WEEKLY · MONTHLY · QUARTERLY · ANNUAL"
        INT estimated_minutes
        BOOLEAN is_active
        VARCHAR(100) created_by
        TIMESTAMP created_at
    }

    maintenance_area_logs {
        UUID id PK
        UUID task_id FK "FK a maintenance_area_tasks(id)"
        VARCHAR(100) performed_by
        TIMESTAMP performed_at
        TEXT notes
        TEXT evidence_path
        VARCHAR(100) verified_by
        TIMESTAMP verified_at
        UUID signature_id FK "FK a on_chain_signatures(id)"
    }

    maintenance_area_types ||--o{ maintenance_areas : "tipifica"
    maintenance_areas ||--o{ maintenance_area_tasks : "tiene"
    maintenance_area_tasks ||--o{ maintenance_area_logs : "genera"
```

---

## 3. Incidencias de mantenimiento extendidas

```mermaid
erDiagram
    rooms {
        UUID id PK
        INT room_number UK
        VARCHAR(20) publication_status
        VARCHAR(12) operational_status
        DATE maintenance_blocked_until
        VARCHAR(200) maintenance_blocked_reason
        TIMESTAMP last_inspection_at
        VARCHAR(12) last_inspection_result
    }

    maintenance_incidents {
        UUID id PK
        UUID room_id FK "FK a rooms(id); NULL si es área"
        UUID area_id FK "FK a maintenance_areas(id); NULL si es habitación"
        VARCHAR(40) kind
        TEXT description
        VARCHAR(10) priority
        VARCHAR(12) status
        BOOLEAN blocks_sale
        VARCHAR(100) reported_by
        VARCHAR(30) reported_by_role
        VARCHAR(100) assigned_to
        VARCHAR(100) resolved_by
        TIMESTAMP resolved_at
        TEXT resolution_notes
        BIGINT damage_charge_cents
        VARCHAR(3) damage_charge_currency
        VARCHAR(100) damage_charge_approved_by
        UUID block_signature_id FK "FK a on_chain_signatures(id)"
        UUID unblock_signature_id FK "FK a on_chain_signatures(id)"
        TIMESTAMP created_at
    }

    maintenance_incident_events {
        UUID id PK
        UUID incident_id FK "FK a maintenance_incidents(id)"
        VARCHAR(20) event_type
        VARCHAR(200) notes
        VARCHAR(100) actor
        TIMESTAMP created_at
    }

    rooms ||--o{ maintenance_incidents : "sufre"
    maintenance_incidents ||--o{ maintenance_incident_events : "registra"
```

---

## 4. Preventivo de infraestructura extendido

```mermaid
erDiagram
    preventive_plans {
        UUID id PK
        VARCHAR(40) code UK
        VARCHAR(120) name
        VARCHAR(120) equipment
        UUID room_id FK "FK a rooms(id); opcional"
        UUID area_id FK "FK a maintenance_areas(id); opcional"
        VARCHAR(12) periodicity
        BOOLEAN active
        TIMESTAMP created_at
    }

    preventive_tasks {
        UUID id PK
        UUID plan_id FK "FK a preventive_plans(id)"
        DATE due_date
        VARCHAR(12) status
        VARCHAR(100) completed_by
        TIMESTAMP completed_at
        VARCHAR(100) verified_by
        TIMESTAMP verified_at
        BOOLEAN requires_signature
        UUID signature_id FK "FK a on_chain_signatures(id)"
        VARCHAR(30) validation_status "columna-extensión: PENDING_VERIFICATION · VALIDATED · PENDING_VERIFICATION_EXPIRED (SLA 24 h, RNF-M-21)"
        TEXT evidence_path
        TEXT notes
    }

    preventive_plans ||--o{ preventive_tasks : "programa"
```

---

## 5. Housekeeping e inspecciones

```mermaid
erDiagram
    housekeeping_assignments {
        UUID id PK
        UUID shift_id FK
        UUID room_id FK
        VARCHAR(100) assignee
        VARCHAR(12) status
        TIMESTAMP assigned_at
        TIMESTAMP completed_at
    }

    housekeeping_inspections {
        UUID id PK
        UUID room_id FK "FK a rooms(id)"
        UUID assignment_id FK "FK a housekeeping_assignments(id)"
        VARCHAR(100) inspected_by
        VARCHAR(20) inspection_type "CHECKOUT · DAILY_SERVICE"
        VARCHAR(12) result "APPROVED · REJECTED"
        TEXT observations
        UUID signature_id FK "FK a on_chain_signatures(id)"
        TIMESTAMP created_at
    }

    housekeeping_damage_charges {
        UUID id PK
        UUID charge_id FK "FK a additional_charges(id)"
        UUID room_id FK "FK a rooms(id)"
        VARCHAR(66) token_id FK "FK a nfts(token_id); noche/token vendido (D-C4)"
        UUID inspection_id FK "FK a housekeeping_inspections(id)"
        VARCHAR(100) reported_by
        TEXT damage_description
        TEXT evidence_path
        VARCHAR(100) approved_by
        UUID signature_id FK "FK a on_chain_signatures(id)"
        UUID audit_log_id FK "FK lógica a operator_audit_log(id): traza del cargo (columna-extensión)"
        TIMESTAMP created_at
    }

    damage_charge_guest_notifications {
        UUID id PK
        UUID damage_charge_id FK "FK a housekeeping_damage_charges(id)"
        VARCHAR(20) channel "EMAIL · TELEGRAM · WEB"
        TIMESTAMP sent_at
        TIMESTAMP due_date
        VARCHAR(20) status "PENDING · SENT · ACKNOWLEDGED · DISPUTED · EXPIRED"
        TEXT dispute_notes
        TIMESTAMP disputed_at
        VARCHAR(100) resolved_by
        TIMESTAMP resolved_at
    }

    supply_alerts {
        UUID id PK
        UUID supply_item_id FK "FK a supply_items(id)"
        VARCHAR(12) status "OPEN · CLOSED"
        TIMESTAMP opened_at
        TIMESTAMP last_reminded_at
        TIMESTAMP closed_at
    }

    housekeeping_assignments ||--o| housekeeping_inspections : "origina"
    rooms ||--o{ housekeeping_inspections : "inspeccionada"
    housekeeping_damage_charges ||--o{ damage_charge_guest_notifications : "notifica a"
    housekeeping_inspections ||--o| housekeeping_damage_charges : "detecta"
    nfts ||--o| housekeeping_damage_charges : "imputado a"
```

---

## 6. Relaciones con tablas existentes (resumen)

| Tabla vNext | Tabla existente | Relación |
|---|---|---|
| `operator_wallets` | `admin_users` | Lógica por `username` |
| `maintenance_incidents` | `rooms` | FK opcional `room_id` |
| `maintenance_incidents` | `maintenance_areas` | FK opcional `area_id` |
| `preventive_plans` | `rooms` | FK opcional `room_id` |
| `preventive_plans` | `maintenance_areas` | FK opcional `area_id` |
| `housekeeping_inspections` | `rooms` | FK `room_id` |
| `housekeeping_inspections` | `housekeeping_assignments` | FK opcional `assignment_id` |
| `housekeeping_damage_charges` | `additional_charges` | FK `charge_id` |
| `housekeeping_damage_charges` | `rooms` | FK `room_id` |
| `housekeeping_damage_charges` | `housekeeping_inspections` | FK opcional `inspection_id` |

---

*Diagrama ER vNext · @asistenteProyecto.*
