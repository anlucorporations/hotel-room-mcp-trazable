# Diagramas de estado — Propuesta vNext

> **Tipo:** máquinas de estados UML (Mermaid `stateDiagram-v2`) de las entidades con ciclo de vida relevante.
> **Fuente única:** `RepoTecnico/propuesta_vNext/casos_uso.md` (§2 constantes `ROOM_STATES`/`SIGN_STATUS`/`NOTIF_STATUS`; §4 estados canónicos; flujos de CU-V-03, CU-V-05, CU-V-07, CU-V-09, CU-V-21, CU-V-22, CU-V-29, CU-V-32, CU-V-41, CU-V-43).
> **Diccionario de datos:** `RepoTecnico/propuesta_vNext/diccionario_datos.md` §3.14 y `RepoTecnico/propuesta_vNext/base_datos.sql` §12 (restricciones `CHECK` = fuente de verdad).
> **Arquitectura:** `RepoTecnico/propuesta_vNext/documento_tecnico.md` Rev. 1.1.0 §2.5 (máquina de firma) y ADR-18 (sin reconciliador de reorgs).
> **Versión:** 1.1.0 · **Fecha:** 2026-10-06 (rev. vocabulario canónico).
>
> **Convenciones**
> - Los nombres de estado son **literales canónicos** de los enums del diccionario §3.14 y `base_datos.sql` §12: `DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`; `CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`; `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CANCELLED`; `PENDING`, `IN_PROGRESS`, `DONE`; `PENDING_VERIFICATION`, `VALIDATED`, `PENDING_VERIFICATION_EXPIRED`; `APPROVED`, `REJECTED`; `PENDING_SIGNATURE` (persistido `PENDING`), `SIGNED`, `MINED`, `FAILED`, `REVOKED`, marcador de entidad `PENDING_ANCHOR`; `PENDING`, `SENT`, `ACKNOWLEDGED`, `DISPUTED`, `EXPIRED`, `RESOLVED_ACCEPTED`, `RESOLVED_REJECTED`.
> - **No se usan** los valores obsoletos `AVAILABLE`, `CLEANING`, `LIMPIA`, `SUCIA`, `EN_LIMPIEZA`, `OCUPADA`, `BLOQUEADA_MANTENIMIENTO`, `VERIFIED` ni `COMPLETED` (CU-AUD-01/CU-AUD-02).
> - Cada transición cita el caso de uso y, cuando existe, el evento o error canónico que la dispara.

---

## 1. Habitación — estado operativo (`rooms.operational_status`)

```mermaid
stateDiagram-v2
    [*] --> DIRTY : habitación pendiente de limpieza
    DIRTY --> CLEAN : CU-V-29 la camarera completa (asignación DONE)
    CLEAN --> IN_INSPECTION : CU-V-21 el Ama de llaves abre la inspección
    IN_INSPECTION --> CLEAN : CU-V-21 result=APPROVED
    IN_INSPECTION --> DIRTY : CU-V-22 result=REJECTED (asignación vuelve a PENDING)
    CLEAN --> OCCUPIED : check-in del huésped
    OCCUPIED --> PENDING_CLEANING : check-out de la estancia
    PENDING_CLEANING --> OCCUPIED : check-in sobre habitación pendiente
    PENDING_CLEANING --> DIRTY : CU-V-17/CU-V-29 limpieza asignada e iniciada
    CLEAN --> PENDING_CLEANING : CU-V-05 desbloqueo (firma RoomUnblocked, D-C9)
    DIRTY --> PENDING_CLEANING : CU-V-05 desbloqueo (firma RoomUnblocked, D-C9)
    OCCUPIED --> PENDING_CLEANING : CU-V-05 desbloqueo (firma RoomUnblocked, D-C9)
    note right of DIRTY
        operational_status de casos_uso.md §2 y diccionario §3.14
        CLEAN DIRTY OCCUPIED PENDING_CLEANING IN_INSPECTION
        El bloqueo por mantenimiento es publication_status='MAINTENANCE' y NO cambia operational_status
        CU-V-29 permite limpiar una habitacion MAINTENANCE sin habilitar la venta
    end note
```

**Nota.** Ciclo de vida operativo de la habitación con los **cinco** estados canónicos (`CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`): no existe `BLOQUEADA_MANTENIMIENTO` (el bloqueo vive en `publication_status`). La camarera registra `DIRTY → CLEAN` con asignación `PENDING → IN_PROGRESS → DONE` (CU-V-29); la inspección mueve entre `CLEAN`, `IN_INSPECTION` y `DIRTY` (CU-V-21/CU-V-22); el check-out lleva a `PENDING_CLEANING` y el desbloqueo de mantenimiento (CU-V-05) fija también `PENDING_CLEANING` sin modificar `publication_status`.

---

## 2. Habitación — estado de publicación (`rooms.publication_status`)

```mermaid
stateDiagram-v2
    [*] --> DRAFT : alta de la habitación
    DRAFT --> PUBLISHED : CU-V-32 activación manual por Recepción o Administrador
    PUBLISHED --> PAUSED : CU-V-32 desactivación manual de la venta
    PAUSED --> PUBLISHED : CU-V-32 activación manual por Recepción o Administrador
    PUBLISHED --> MAINTENANCE : CU-V-03 bloqueo con firma RoomBlocked
    PAUSED --> MAINTENANCE : CU-V-03 bloqueo con firma RoomBlocked
    MAINTENANCE --> PAUSED : CU-V-05 desbloqueo con firma RoomUnblocked D-C9
    PUBLISHED --> OUT_OF_SERVICE : retirada temporal de la venta (gobierno auditado)
    PAUSED --> OUT_OF_SERVICE : retirada temporal de la venta (gobierno auditado)
    OUT_OF_SERVICE --> PAUSED : reincorporación al circuito (gobierno auditado)
    DRAFT --> OUT_OF_SERVICE : baja de catálogo (gobierno auditado)
    note right of MAINTENANCE
        publication_status de casos_uso.md §2 y diccionario §3.14
        DRAFT PUBLISHED PAUSED MAINTENANCE OUT_OF_SERVICE
        El publicable es PUBLISHED NO existe AVAILABLE ni CLEANING
        El desbloqueo CU-V-05 deja PAUSED y operational_status='PENDING_CLEANING'
        La inspeccion aprobada CU-V-21 no cambia publication_status D-C9 y D-C15
        Solo CU-V-32 libera la venta
    end note
```

**Nota.** `publication_status` gobierna la visibilidad en el catálogo con los **cinco** estados canónicos (`DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`); **no existe `AVAILABLE` ni `CLEANING`**. El bloqueo de mantenimiento (CU-V-03) lleva a `MAINTENANCE` y el desbloqueo (CU-V-05) deja `PAUSED` + `operational_status='PENDING_CLEANING'`, **nunca** `PUBLISHED` automáticamente (D-C9); la activación de la venta es una acción manual de Recepción/Administrador (CU-V-32) que fija `PUBLISHED`. Ni el desbloqueo ni la inspección aprobada habilitan la venta por sí mismos.

---

## 3. Incidencia de mantenimiento (`maintenance_incidents.status`)

```mermaid
stateDiagram-v2
    [*] --> OPEN : CU-V-15 CU-V-23 CU-V-31 reportan la incidencia
    OPEN --> IN_PROGRESS : CU-V-02 clasificación y asignación a un técnico activo
    IN_PROGRESS --> IN_PROGRESS : CU-V-02 reasignación auditada como ASSIGN
    IN_PROGRESS --> RESOLVED : CU-V-04 resolution_notes no vacío y repuestos registrados
    OPEN --> CANCELLED : cancelación administrativa auditada
    IN_PROGRESS --> CANCELLED : cancelación administrativa auditada
    note right of RESOLVED
        maintenance_incidents.status canonical
        OPEN IN_PROGRESS RESOLVED CANCELLED
        Resolver una incidencia no modifica publication_status
        Si blocks_sale=TRUE la habitacion sigue MAINTENANCE hasta CU-V-05
        No se modela reapertura automatica (el aviso de reapertura usa data-testid="conflict-warning" CU-V-20 y CU-V-22)
        Restriccion exactamente uno de room_id o area_id IncidentRoomRequired
    end note
```

**Nota.** Estados `OPEN`, `IN_PROGRESS`, `RESOLVED` y `CANCELLED` del diccionario §3.14. La clasificación/asignación (`CU-V-02`) pasa a `IN_PROGRESS` y audita `ASSIGN`; el cierre (`CU-V-04`) exige `resolution_notes`, mantiene `publication_status='MAINTENANCE'` cuando `blocks_sale = TRUE` y **no** libera la venta (eso es CU-V-05). No existe reapertura automática: el aviso de reapertura se marca con `data-testid="conflict-warning"` (CU-V-20/CU-V-22) y queda auditado.

---

## 4. Inspección de limpieza (`housekeeping_inspections.result`)

```mermaid
stateDiagram-v2
    [*] --> IN_INSPECTION : CU-V-21 habitación CLEAN con asignación DONE
    IN_INSPECTION --> APPROVED : result=APPROVED
    IN_INSPECTION --> REJECTED : result=REJECTED con observaciones obligatorias
    APPROVED --> [*] : signature_id NULL o firma INSPECTION si INSPECTION_REQUIRES_SIGNATURE=TRUE
    REJECTED --> [*] : CU-V-22 asignación vuelve a PENDING y habitación a DIRTY
    note right of APPROVED
        inspection_type CHECKOUT o DAILY_SERVICE
        result APPROVED o REJECTED (unico enum canonico)
        Si INSPECTION_REQUIRES_SIGNATURE=TRUE exige firma on-chain HousekeepingInspected
        No libera la venta publication_status sigue en PAUSED
    end note
```

**Nota.** La inspección parte de una habitación `CLEAN` con asignación `DONE`. `result='APPROVED'` actualiza `rooms.last_inspection_result` y certifica la limpieza, con firma on-chain **solo** si `INSPECTION_REQUIRES_SIGNATURE = TRUE` (D-C23); `result='REJECTED'` exige observaciones y devuelve la asignación a `PENDING` (`housekeeping_assignments.status` ∈ {`PENDING`, `IN_PROGRESS`, `DONE`}, no existe `REJECTED`) dejando la habitación en `DIRTY` (CU-V-22). En ningún caso cambia `publication_status`, que permanece `PAUSED` (D-C9/D-C15).

---

## 5. Firma on-chain (`on_chain_signatures.status` y marcador de entidad `PENDING_ANCHOR`)

```mermaid
stateDiagram-v2
    [*] --> PENDING_SIGNATURE : acción crítica solicitada
    PENDING_SIGNATURE --> SIGNED : firma EIP-712 verificada y rol vigente
    PENDING_SIGNATURE --> FAILED : deadline vencido / firma inválida (SignatureMismatch)
    SIGNED --> MINED : tx del relayer confirmada (CONFIRMATIONS_N = 1)
    SIGNED --> PENDING_ANCHOR : cadena o RPC no disponible (RPC_TIMEOUT_MS)
    PENDING_ANCHOR --> SIGNED : next_attempt_at vencido (reintento del outbox)
    PENDING_ANCHOR --> FAILED : ANCHOR_MAX_RETRIES 8 o ANCHOR_TTL_HOURS 24 h agotados
    FAILED --> SIGNED : reintento manual del Soporte (misma firma, CU-V-43)
    SIGNED --> REVOKED : rol on-chain revocado antes de minar
    SIGNED --> FAILED : RoleChangedSinceSigning
    MINED --> [*]
    FAILED --> [*] : cierre definitivo (nueva firma requerida si cambió el rol o el dominio)
    REVOKED --> [*]
    note right of PENDING_ANCHOR
        PENDING_ANCHOR es estado de ENTIDAD no de la firma (diccionario 3.14)
        on_chain_signatures.status canonico PENDING SIGNED MINED FAILED REVOKED
        PENDING_SIGNATURE es el nombre de dominio del valor persistido PENDING
        Impide nueva accion sobre la entidad EntityPendingAnchor HTTP 423
        MINED es terminal no hay reconciliador de reorgs ADR-10 y ADR-18
    end note
```

**Nota.** Máquina de la firma on-chain: `PENDING_SIGNATURE` (persistido `PENDING`) → `SIGNED` → `MINED`, con desvíos a `FAILED` (`SignatureMismatch`, `RoleChangedSinceSigning`, agotamiento de reintentos) y a `REVOKED` (rol revocado antes de minar). El marcador `PENDING_ANCHOR` es **estado de entidad**, no de la firma: refleja que la entidad tiene una firma `SIGNED` en cola de anclaje, impide una nueva acción sobre la misma entidad (`EntityPendingAnchor`, HTTP 423) y se resuelve en `MINED` o `FAILED` sin revertir nunca el estado off-chain (D-C18/D-C34). `MINED` es terminal (ADR-18, sin reconciliador de reorgs); el outbox transaccional reintenta con `ANCHOR_BACKOFF` y el Soporte admite reintento manual desde `FAILED` (CU-V-43).

---

## 6. Notificación de cargo por daños al huésped (`damage_charge_guest_notifications.status`)

```mermaid
stateDiagram-v2
    [*] --> PENDING : CU-V-24 registra el cargo y prepara la notificación
    PENDING --> SENT : envío por el canal preferido EMAIL TELEGRAM o WEB
    SENT --> ACKNOWLEDGED : el huésped conforme sin reclamación
    SENT --> DISPUTED : el huésped reclama con dispute_notes dentro de plazo
    SENT --> EXPIRED : vence due_date sin reclamación
    DISPUTED --> RESOLVED_ACCEPTED : CU-V-33 acepta (anula o ajusta el cargo)
    DISPUTED --> RESOLVED_REJECTED : CU-V-33 desestima (mantiene el cargo)
    ACKNOWLEDGED --> [*]
    EXPIRED --> [*] : el cargo se mantiene para el cobro en CU-V-34
    RESOLVED_ACCEPTED --> [*]
    RESOLVED_REJECTED --> [*] : el cargo se mantiene para el cobro en CU-V-34
    note right of DISPUTED
        damage_charge_guest_notifications.status canonico
        PENDING SENT ACKNOWLEDGED DISPUTED EXPIRED RESOLVED_ACCEPTED RESOLVED_REJECTED
        ACKNOWLEDGED = huesped conforme SIN reclamacion NO es una resolucion CU-AUD-05
        La resolucion de una reclamacion usa RESOLVED_ACCEPTED o RESOLVED_REJECTED
        Un cargo DISPUTED bloquea el check-out hasta resolverse CU-V-34
        El cargo por danos no se firma on-chain D-C27
    end note
```

**Nota.** Ciclo de la notificación al huésped por un cargo por daños (vocabulario canónico §3.14). El plazo lo fija `DAMAGE_CLAIM_WINDOW_H`; el huésped puede quedar conforme sin reclamación (`ACKNOWLEDGED`, **no** es una resolución) o reclamar dentro de plazo (`DISPUTED`). Recepción resuelve con `RESOLVED_ACCEPTED` (anula/ajusta el cargo) o `RESOLVED_REJECTED` (mantiene el cargo) y fija `resolved_by`/`resolved_at` (CU-V-33); el vencimiento sin reclamación marca `EXPIRED` y deja el cargo listo para el cobro en el check-out (CU-V-34). El cargo nunca se firma on-chain (D-C27).

---

*Diagramas de estado vNext · Fase 2 · @asistenteProyecto · 2026-10-06 (rev. 1.1.0, vocabulario canónico).*
