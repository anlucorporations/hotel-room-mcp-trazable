# Diagramas de secuencia — Propuesta vNext

> **Tipo:** diagramas de secuencia UML (Mermaid) de los flujos principales de los casos clave.
> **Fuente única:** `RepoTecnico/propuesta_vNext/casos_uso.md` (flujo principal, flujos alternativos y restricciones EARS de cada CU; vocabulario canónico §2/§4 y CU-AUD-01…CU-AUD-20).
> **Diccionario de datos:** `RepoTecnico/propuesta_vNext/diccionario_datos.md` §3.14 y `RepoTecnico/propuesta_vNext/base_datos.sql` §12 (vocabulario canónico de estados).
> **Arquitectura:** `RepoTecnico/propuesta_vNext/documento_tecnico.md` Rev. 1.1.0 (meta-transacción/relayer, `signer = recovered_signer`, **outbox transaccional PostgreSQL**, ADR-18 sin reconciliador de reorgs).
> **Versión:** 1.1.0 · **Fecha:** 2026-10-06 (rev. vocabulario canónico).
>
> **Convenciones**
> - Actores con los nombres literales del §6 de `casos_uso.md`.
> - Mensajes síncronos `->>`, respuestas `-->>`; `alt`/`else` para flujos alternativos y `opt`/`loop` para tramos opcionales o repetitivos.
> - **Vocabulario canónico** (diccionario §3.14): `rooms.publication_status` ∈ {`DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`}; `rooms.operational_status` ∈ {`CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`}; `on_chain_signatures.status` ∈ {`PENDING`, `SIGNED`, `MINED`, `FAILED`, `REVOKED`}; `preventive_tasks.validation_status` ∈ {`PENDING_VERIFICATION`, `VALIDATED`, `PENDING_VERIFICATION_EXPIRED`}; `housekeeping_assignments.status` ∈ {`PENDING`, `IN_PROGRESS`, `DONE`}; `damage_charge_guest_notifications.status` ∈ {`PENDING`, `SENT`, `ACKNOWLEDGED`, `DISPUTED`, `EXPIRED`, `RESOLVED_ACCEPTED`, `RESOLVED_REJECTED`}.
> - **No se usan** los valores obsoletos `AVAILABLE`, `CLEANING`, `LIMPIA`, `SUCIA`, `BLOQUEADA_MANTENIMIENTO`, `VERIFIED` ni `COMPLETED`. El bloqueo por mantenimiento es `publication_status='MAINTENANCE'`; el desbloqueo deja `publication_status='PAUSED'` + `operational_status='PENDING_CLEANING'`; Recepción activa la venta con `publication_status='PUBLISHED'` (CU-V-32).

---

## 1. CU-V-03 — Bloqueo de habitación para venta con firma on-chain (obligatoria)

```mermaid
sequenceDiagram
    autonumber
    actor JEFE as Jefe de Mantenimiento
    participant UI as Suite Mantenimiento UI
    participant API as API de operaciones
    participant BD as PostgreSQL (outbox on_chain_signatures)
    participant RELAYER as Worker relayer (sin rol)
    participant CONTRATO as HotelOperations.sol

    JEFE->>UI: pulsa «Bloquear para venta» y fija reason y until
    UI->>UI: marca la acción con data-testid="requires-signature"
    UI->>API: POST bloqueo con roomNumber, reason y until

    alt Habitación ya bloqueada
        API-->>UI: HTTP 409 RoomAlreadyBlocked(roomNumber)
    else Habitación sin publication_status='PUBLISHED'
        API-->>UI: HTTP 409 (precondición: el publicable es PUBLISHED)
    else Wallet no conectada
        UI-->>JEFE: botón disabled con data-testid="wallet-disconnected"
    else Wallet sin HEAD_MAINTENANCE_ROLE
        API->>CONTRATO: intenta firmar ROOM_BLOCK (meta-transacción)
        CONTRATO-->>API: revert AccessControlUnauthorizedAccount
    else Flujo correcto
        UI-->>JEFE: modal data-testid="signature-preview" con acción, entidad y datos
        JEFE->>UI: confirma y firma el mensaje EIP-712
        UI->>API: envía firma
        API->>API: verifica recovered_signer == signer_address y role_snapshot (D-C16)
        alt recovered_signer distinto de signer_address
            API->>BD: on_chain_signatures.status='FAILED' con SignatureMismatch
            API-->>UI: la habitación no cambia de estado
        else Firma válida
            API->>BD: on_chain_signatures (entity_type=ROOM_BLOCK, status='SIGNED') y estado de entidad PENDING_ANCHOR
            RELAYER->>CONTRATO: emite OperationalAction('ROOM_BLOCK', entityId, payloadHash, signer, timestamp)
            alt RPC no responde dentro de RPC_TIMEOUT_MS
                RELAYER->>BD: firma sigue SIGNED, next_attempt_at con backoff ANCHOR_BACKOFF
                API-->>UI: entidad marcada como PENDING_ANCHOR (data-testid="signature-pending-anchor")
                Note over API,UI: un segundo intento devuelve HTTP 423 EntityPendingAnchor
            else Transacción confirmada (CONFIRMATIONS_N = 1)
                CONTRATO-->>RELAYER: RoomBlocked(roomNumber, reason, until, signer, timestamp)
                RELAYER->>BD: on_chain_signatures.status='MINED' con tx_hash y mined_at, y se quita PENDING_ANCHOR
                API->>BD: rooms.publication_status='MAINTENANCE' (operational_status NO se modifica)
                API->>BD: rooms.maintenance_blocked_until y maintenance_blocked_reason
                API->>BD: maintenance_incidents.block_signature_id apunta a la firma
                API-->>UI: el catálogo público deja de mostrar la habitación
            end
        end
    end
```

**Nota.** Bloqueo de habitación: la firma on-chain es **obligatoria** (`MAINTENANCE_BLOCK_REQUIRES_SIGNATURE = true`, D-C34) y se verifica criptográficamente EIP-712 antes de persistir (D-C16). La precondición es `publication_status='PUBLISHED'` (CU-AUD-01). El único cambio de estado es `rooms.publication_status='MAINTENANCE'`: el `operational_status` **no** se modifica por el bloqueo (no existe `BLOQUEADA_MANTENIMIENTO`). La firma recorre `PENDING_SIGNATURE` (persistido `PENDING`) → `SIGNED` → `MINED`/`FAILED`, y el marcador **de entidad** `PENDING_ANCHOR` impide una nueva acción (HTTP 423 `EntityPendingAnchor`); la evidencia no adjunta solo avisa (D-C12).

---

## 2. CU-V-05 — Desbloqueo de habitación tras verificación (obligatoria)

```mermaid
sequenceDiagram
    autonumber
    actor JEFE as Jefe de Mantenimiento
    participant UI as Suite Mantenimiento UI
    participant API as API de operaciones
    participant BD as PostgreSQL (outbox on_chain_signatures)
    participant RELAYER as Worker relayer (sin rol)
    participant CONTRATO as HotelOperations.sol
    participant AMA as Ama de llaves

    JEFE->>UI: pulsa «Desbloquear» sobre una habitación en MAINTENANCE
    UI->>API: solicita el desbloqueo
    API->>BD: comprueba incidencias OPEN/IN_PROGRESS con blocks_sale=TRUE

    alt Quedan incidencias abiertas
        API-->>UI: HTTP 422 OpenIncident(incidentId)
    else Habitación no bloqueada
        API-->>UI: HTTP 409 RoomNotBlocked(roomNumber)
    else Firma de un técnico sin rol
        CONTRATO-->>API: revert AccessControlUnauthorizedAccount(account, HEAD_MAINTENANCE_ROLE)
    else Flujo correcto
        UI-->>JEFE: data-testid="requires-signature" y modal data-testid="signature-preview"
        JEFE->>UI: firma EIP-712
        UI->>API: envía firma ROOM_UNBLOCK
        API->>API: verifica recovered_signer == signer_address y role_snapshot (D-C16)
        alt recovered_signer distinto de signer_address o rol cambiado
            API->>BD: on_chain_signatures.status='FAILED' con SignatureMismatch o RoleChangedSinceSigning
        else Firma válida
            API->>BD: on_chain_signatures (entity_type=ROOM_UNBLOCK, status='SIGNED') y estado de entidad PENDING_ANCHOR
            RELAYER->>CONTRATO: emite OperationalAction('ROOM_UNBLOCK', entityId, payloadHash, signer, timestamp)
            alt Cadena caída
                API-->>UI: entidad PENDING_ANCHOR, sin nueva acción (HTTP 423)
            else Anclaje confirmado
                CONTRATO-->>RELAYER: RoomUnblocked(roomNumber, signer, timestamp)
                RELAYER->>BD: status='MINED' y se quita PENDING_ANCHOR
                API->>BD: rooms.publication_status='PAUSED' (no 'PUBLISHED', D-C9)
                API->>BD: rooms.operational_status='PENDING_CLEANING'
                API->>BD: maintenance_blocked_until y maintenance_blocked_reason a NULL
                API->>BD: maintenance_incidents.unblock_signature_id = firma
                API->>AMA: notifica habitación lista para limpieza (CU-V-19, CU-V-11 fusionado)
            end
        end
    end
```

**Nota.** El desbloqueo exige firma on-chain con `HEAD_MAINTENANCE_ROLE`, verifica EIP-712 (CU-AUD-19) y deja la habitación en `publication_status='PAUSED'` + `operational_status='PENDING_CLEANING'`, **nunca** en `PUBLISHED` (D-C9): la venta la activa Recepción/Admin de forma manual (CU-V-32). Si quedan incidencias abiertas que bloquean venta, se rechaza con `OpenIncident`; la aprobación posterior de la inspección tampoco libera la venta (D-C15). La notificación al Ama de llaves corresponde a CU-V-19 (CU-V-11 queda fusionado, CU-AUD-03).

---

## 3. CU-V-21 — Inspección de limpieza y certificación (firma opcional)

```mermaid
sequenceDiagram
    autonumber
    actor AMA as Ama de llaves
    participant UI as Suite Ama de llaves UI
    participant API as API de housekeeping
    participant BD as PostgreSQL
    participant CONTRATO as HotelOperations.sol

    AMA->>UI: abre la inspección de una habitación CLEAN
    AMA->>UI: fija inspection_type (CHECKOUT / DAILY_SERVICE) y result (APPROVED / REJECTED)
    UI->>API: registra inspección con room_id, assignment_id y observations
    API->>BD: inserta housekeeping_inspections con room_id como FK principal (D-C5)

    alt result=REJECTED
        API-->>UI: exige observations y deriva a CU-V-22 (asignación vuelve a PENDING y habitación a DIRTY)
    else result=APPROVED y INSPECTION_REQUIRES_SIGNATURE=FALSE
        API->>BD: signature_id = NULL (firma opcional, D-C23)
        API->>BD: rooms.last_inspection_at y last_inspection_result='APPROVED'
        API-->>UI: habitación certificada
    else result=APPROVED, flag=TRUE y sin wallet
        API-->>UI: HTTP 422 MissingRequiredSignature(INSPECTION)
    else result=APPROVED, flag=TRUE y wallet con HEAD_KEEPER_ROLE
        UI-->>AMA: modal data-testid="signature-preview"
        AMA->>UI: firma EIP-712 de la inspección
        UI->>API: envía firma (entity_type=INSPECTION)
        API->>BD: on_chain_signatures.status='SIGNED'
        CONTRATO-->>API: HousekeepingInspected(roomNumber, inspectionType, result, signer, timestamp)
        API->>BD: rooms.last_inspection_result='APPROVED'
    end

    Note over API,BD: rooms.publication_status permanece 'PAUSED' (D-C9/D-C15). La venta solo se libera con CU-V-32
```

**Nota.** La inspección parte de una habitación `CLEAN` con asignación `DONE` y es **opcional** en firma (`INSPECTION_REQUIRES_SIGNATURE`, D-C23). Un resultado `REJECTED` no certifica y encadena a CU-V-22 (asignación a `PENDING`, habitación a `DIRTY`); un `APPROVED` actualiza `last_inspection_result` pero **no** libera la venta: `publication_status` permanece en `PAUSED` hasta la activación manual de Recepción/Admin (`PUBLISHED`).

---

## 4. CU-V-24 + CU-V-41 — Registro del cargo por daños y notificación al huésped (sin firma on-chain)

```mermaid
sequenceDiagram
    autonumber
    actor AMA as Ama de llaves
    participant UI as Suite Ama de llaves UI
    participant API as API de housekeeping
    participant BD as PostgreSQL
    participant HUESPED as Huésped
    actor RECEP as Recepción

    AMA->>UI: registra damage_description, importe, moneda EUR y evidence_path (opcional)
    UI->>API: envía el cargo por daños
    API->>BD: valida amount_cents > 0 (CHECK additional_charges.amount_cents > 0)

    alt Importe <= 0
        API-->>UI: HTTP 422
    else Habitación inexistente
        API-->>UI: HTTP 404
    else Flujo correcto
        API->>BD: crea additional_charge
        API->>BD: crea housekeeping_damage_charges con room_id, charge_id, token_id e inspection_id
        API->>BD: signature_id = NULL (D-C27, auditoría off-chain)
        API->>BD: escribe operator_audit_log y vincula audit_log_id
        API->>BD: damage_charge_guest_notifications (channel, sent_at, due_date, status='SENT')
        API->>HUESPED: notifica con descripción, importe y enlace firmado a la evidencia
        alt Evidencia con EXIF/GPS
            BD-->>API: imagen cifrada sin metadatos, servida con URL firmada temporal (D-C19)
        end
        alt Huésped conforme sin reclamación
            HUESPED->>API: Acknowledge
            API->>BD: status='ACKNOWLEDGED' (no es una resolución)
        else Huésped no reclama en plazo
            API->>BD: status='EXPIRED' y el cargo queda para cobro en CU-V-34
        else Huésped reclama dentro de plazo
            HUESPED->>API: Dispute con dispute_notes
            API->>BD: status='DISPUTED' con dispute_notes y disputed_at
            RECEP->>API: resuelve la reclamación (CU-V-33)
            alt Recepción acepta: anula/ajusta el cargo
                API->>BD: status='RESOLVED_ACCEPTED' con resolved_by y resolved_at
            else Recepción desestima: mantiene el cargo
                API->>BD: status='RESOLVED_REJECTED' con resolved_by y resolved_at
            end
        end
    end
```

**Nota.** El cargo por daños **no se firma on-chain** (`DAMAGE_CHARGE_REQUIRES_SIGNATURE = false`, D-C27): se audita off-chain en `operator_audit_log`. El cargo se vincula al `token_id` de la noche vendida cuando existe (D-C4) y siempre dispara la notificación al huésped (`damage_charge_guest_notifications`) con plazo de reclamación `DAMAGE_CLAIM_WINDOW_H`. `ACKNOWLEDGED` significa «huésped conforme sin reclamación» (CU-AUD-05); la resolución de una reclamación usa `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED`, nunca `ACKNOWLEDGED`.

---

## 5. CU-V-07 — Tarea preventiva de área crítica (firma obligatoria)

```mermaid
sequenceDiagram
    autonumber
    actor JEFE as Jefe de Mantenimiento
    actor TECH as Técnico de mantenimiento
    participant UI as Suite Mantenimiento UI
    participant API as API de mantenimiento
    participant BD as PostgreSQL (outbox on_chain_signatures)
    participant RELAYER as Worker relayer (sin rol)
    participant CONTRATO as HotelOperations.sol

    TECH->>BD: registra completed_by, completed_at, notes y evidence_path
    JEFE->>UI: abre la verificación de la tarea preventiva vencida o en curso
    API->>BD: lee preventive_tasks.requires_signature derivado de maintenance_area_types.is_critical

    alt Área no crítica (requires_signature=FALSE)
        JEFE->>UI: verifica sin firma
        API->>BD: preventive_tasks verified_by, verified_at, signature_id=NULL
        API->>BD: preventive_tasks.validation_status='VALIDATED' (status de tarea 'DONE')
        API->>BD: traza off-chain en operator_audit_log
        Note over API,CONTRATO: no se emite ningún evento on-chain
    else Área crítica y sin firma
        API-->>UI: HTTP 422 MissingRequiredSignature(PREVENTIVE_TASK)
    else Área crítica con firma
        UI-->>JEFE: data-testid="requires-signature" y modal data-testid="signature-preview"
        JEFE->>UI: firma EIP-712 (wallet con HEAD_MAINTENANCE_ROLE)
        UI->>API: envía firma (entity_type=PREVENTIVE_TASK)
        API->>BD: on_chain_signatures.status='SIGNED'
        RELAYER->>CONTRATO: encola el anclaje del outbox
        alt Cadena caída
            API-->>UI: entidad PENDING_ANCHOR con backoff ANCHOR_BACKOFF. No se marca VALIDATED hasta SIGNED
        else Transacción confirmada
            CONTRATO-->>RELAYER: PreventiveTaskVerified(taskId, planCode, signer, timestamp)
            RELAYER->>BD: on_chain_signatures.status='MINED' y se quita PENDING_ANCHOR
            API->>BD: preventive_tasks.verified_by, verified_at y signature_id
            API->>BD: preventive_tasks.validation_status='VALIDATED' (status de tarea 'DONE')
            API-->>UI: evidencia no adjunta solo genera aviso (D-C12)
        end
    end
```

**Nota.** En áreas críticas (`POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR`; D-C20/D-C34) la verificación exige firma on-chain con `HEAD_MAINTENANCE_ROLE` y emite `PreventiveTaskVerified`. La validación del jefe se modela con `preventive_tasks.validation_status='VALIDATED'` (`PENDING_VERIFICATION` → `VALIDATED`/`PENDING_VERIFICATION_EXPIRED`), **no** con un `status='VERIFIED'` inexistente: `status` solo admite `PENDING`/`DONE`/`SKIPPED`. La firma se deriva de `maintenance_area_types.is_critical` como única fuente de verdad (CU-V-06).

---

## 6. CU-V-09 + CU-V-39 — Validación de tarea de subordinado con SLA de 24 h

```mermaid
sequenceDiagram
    autonumber
    actor TECH as Técnico de mantenimiento
    actor JEFE as Jefe de Mantenimiento
    actor ADMIN as Administrador / Owner
    participant UI as Panel de validación
    participant API as API de mantenimiento
    participant BD as PostgreSQL
    participant JOB as Proceso de vencimiento SLA

    TECH->>API: cierra la tarea (CU-V-14)
    API->>BD: preventive_tasks.status='DONE' y validation_status='PENDING_VERIFICATION'
    API-->>UI: data-testid="pending-verification" y data-testid="sla-countdown"

    alt Validación dentro de las 24 h
        JEFE->>API: valida la tarea
        API->>BD: validation_status='VALIDATED' con validador distinto del ejecutor
        API-->>UI: deja de mostrarse data-testid="sla-countdown"
    else Rechazo del jefe
        JEFE->>API: rechaza con observaciones
        API->>BD: validation_status='PENDING_VERIFICATION' y la tarea vuelve al técnico con observaciones
    else Subordinado intenta auto-validarse
        TECH->>API: intenta validar su propia tarea
        API-->>TECH: HTTP 403
    else Validar tarea no completada o ya validada
        API-->>JEFE: HTTP 422 o HTTP 409
    end

    loop Cada SLA_VALIDATION_HOURS (24 h) sin validación
        JOB->>BD: comprueba tareas con validation_status='PENDING_VERIFICATION'
        JOB->>BD: validation_status='PENDING_VERIFICATION_EXPIRED'
        JOB->>ADMIN: escala la tarea al Administrador (CU-V-39)
        ADMIN->>API: reasigna la validación, valida o devuelve al ejecutor
        API->>BD: nueva asignación o validation_status='VALIDATED' con actor_role=DEFAULT_ADMIN_ROLE
        API->>BD: traza de la decisión en operator_audit_log
    end

    Note over BD: la tarea vencida no bloquea la habitación, pero no cuenta como completada (RNF-M-21)
```

**Nota.** El SLA de validación es de 24 h (`SLA_VALIDATION_HOURS`, D-C38/RNF-M-21). Vencido, la tarea pasa a `validation_status='PENDING_VERIFICATION_EXPIRED'` y se escala al Administrador (CU-V-39); la tarea vencida **no** bloquea la habitación, pero no computa como completada, y la validación siempre la realiza un jefe distinto del ejecutor. `preventive_tasks.status` se mantiene en `DONE` mientras `validation_status` recorre `PENDING_VERIFICATION` → `VALIDATED`/`PENDING_VERIFICATION_EXPIRED`.

---

## 7. CU-V-32 — Activación manual de la venta por Recepción (sin firma)

```mermaid
sequenceDiagram
    autonumber
    actor RECEP as Recepción
    participant UI as Gestión de habitación
    participant API as API de habitaciones
    participant BD as PostgreSQL
    participant CATALOGO as Catálogo público

    RECEP->>UI: pulsa «Activar venta» en la habitación
    UI->>API: solicita la activación
    API->>BD: comprueba bloqueo por mantenimiento e incidencias con blocks_sale

    alt Habitación bloqueada por mantenimiento (publication_status='MAINTENANCE')
        API-->>UI: HTTP 409 RoomBlockedByMaintenance(roomNumber)
    else Inspección REJECTED o ausente
        API-->>UI: exige confirmación explícita y registra la excepción
    else Desactivar venta con reservas activas
        API-->>UI: avisa del impacto y exige confirmación explícita
    end

    RECEP->>API: confirma la activación
    alt Activar venta
        API->>BD: rooms.publication_status='PUBLISHED'
    else Desactivar venta
        API->>BD: rooms.publication_status='PAUSED'
    end
    API->>BD: operator_audit_log action=UPDATE con actor_role=RECEPTION_ROLE
    API->>CATALOGO: la habitación aparece en el catálogo público si está PUBLISHED
    Note over API,RECEP: Recepción no firma on-chain (D-C37). La liberación no exige firma por defecto (D-C9/D-C15)
```

**Nota.** La venta **solo** se libera con una acción manual de Recepción o del Administrador (CU-V-32, D-C9): ni el desbloqueo de mantenimiento (CU-V-05) ni la inspección aprobada (CU-V-21) la activan. Al activar, `publication_status='PUBLISHED'` (el publicable es `PUBLISHED`, no `AVAILABLE`); al desactivar, `'PAUSED'`. Si la habitación está bloqueada por mantenimiento se rechaza con el error propio `RoomBlockedByMaintenance` (CU-AUD-10), distinto de `RoomAlreadyBlocked`. Recepción no dispone de capacidad de firma on-chain (D-C37) y toda activación/desactivación queda auditada.

---

## 8. CU-V-43 — Supervisión de la cola de anclajes y firmas pendientes

```mermaid
sequenceDiagram
    autonumber
    actor SOPORTE as Soporte
    participant UI as Cola de anclajes
    participant WORKER as Worker relayer (outbox)
    participant BD as PostgreSQL (outbox on_chain_signatures)
    participant CONTRATO as HotelOperations.sol
    participant JOB as Monitor de alertas

    SOPORTE->>UI: abre data-testid="anchor-queue"
    UI->>BD: consulta firmas por estado, retry_count y next_attempt_at
    BD-->>UI: firmas PENDING (PENDING_SIGNATURE) / SIGNED / MINED / FAILED / REVOKED con su entidad
    UI-->>SOPORTE: métricas de cola, saldo de gas por wallet y alertas

    loop Reintento con backoff ANCHOR_BACKOFF (outbox transaccional)
        WORKER->>CONTRATO: reintenta el anclaje (relayer sin rol)
        alt Confirmación
            CONTRATO-->>WORKER: evento confirmado (CONFIRMATIONS_N = 1)
            WORKER->>BD: status='MINED' y la entidad deja de estar PENDING_ANCHOR
        else RPC caído
            WORKER->>BD: reprograma el job con next_attempt_at y backoff
            UI-->>SOPORTE: data-testid="degraded-state"
        else Backoff agotado (ANCHOR_MAX_RETRIES=8 o ANCHOR_TTL_HOURS=24 h)
            WORKER->>BD: status='FAILED' y la entidad permanece PENDING_ANCHOR
            Note over BD: no se revierte el estado off-chain y se bloquea nueva acción sobre la entidad
        end
    end

    JOB->>BD: evalúa firmas SIGNED/PENDING_ANCHOR > PENDING_ALERT_MIN (10 min) o retry_count > RETRY_ALERT_COUNT (5)
    JOB-->>SOPORTE: alerta de cola
    alt RoleChangedSinceSigning
        WORKER->>BD: status='FAILED' y exige nueva firma del rol vigente
    else Reintento manual del Soporte (misma firma)
        SOPORTE->>BD: status='SIGNED' y next_attempt_at = now() y el outbox reencola
    else Nonce atascado
        WORKER->>WORKER: serializa por wallet del relayer y permite reemplazo controlado
    end
    Note over CONTRATO,BD: MINED es terminal, no hay reconciliador de reorgs (ADR-10/ADR-18). La integridad la garantizan el outbox idempotente y el catch-up por bloque de despliegue
```

**Nota.** El Soporte (mismo rol que Administrador/Owner) vigila la cola de anclajes: `data-testid="anchor-queue"` con estados, reintentos y alertas. La cola es un **outbox transaccional PostgreSQL** (`on_chain_signatures` como fuente de verdad) y el relayer no tiene rol on-chain. El anclaje usa backoff `ANCHOR_BACKOFF` hasta `ANCHOR_MAX_RETRIES` (8) con TTL `ANCHOR_TTL_HOURS` (24 h); agotado, la firma pasa a `FAILED` y la entidad queda `PENDING_ANCHOR` sin revertir el estado off-chain. `PENDING_SIGNATURE` es el nombre de dominio del valor persistido `PENDING`; `MINED` es terminal y **no** hay transición por reorg (ADR-18), por lo que la integridad se apoya en el outbox idempotente y el catch-up por bloque.

---

*Diagramas de secuencia vNext · Fase 2 · @asistenteProyecto · 2026-10-06 (rev. 1.1.0, vocabulario canónico).*
