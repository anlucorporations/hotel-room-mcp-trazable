# Diagrama de casos de uso — Propuesta vNext

> **Tipo:** representación gráfica UML (Mermaid) del catálogo de casos de uso de Fase 2.
> **Fuente única:** `RepoTecnico/propuesta_vNext/casos_uso.md` (CU-V-01 … CU-V-45, actores y objetivos idénticos al §6 y al §18).
> **Diccionario de datos:** `RepoTecnico/propuesta_vNext/diccionario_datos.md` §3.14 y `RepoTecnico/propuesta_vNext/base_datos.sql` §12 (vocabulario canónico de estados).
> **Versión:** 1.1.0 · **Fecha:** 2026-10-06 (rev. vocabulario canónico, CU-AUD-01…CU-AUD-03).
>
> **Convenciones de lectura**
> - Nodo rectangular = **actor** (rol de plataforma entre paréntesis).
> - Nodo de esquinas redondeadas = **caso de uso**, rotulado `CU-V-XX` + objetivo literal del §18.
> - Flecha continua `-->` = **asociación** actor → caso de uso.
> - Flecha discontinua `-.->` = relación UML **«include»**, **«extend»** o **«fusión»**, rotulada.
> - La firma on-chain obligatoria (CU-V-03, CU-V-05, CU-V-07, CU-V-38) se marca con el icono ⛓ en la etiqueta; la inspección (CU-V-21) es opcional (D-C23) y el cargo por daños (CU-V-24) no se firma (D-C27).
> - **CU-V-11 está fusionado en CU-V-19** (CU-AUD-03): se conserva el número como nodo de referencia «fusionado», sin actor asociado.
>
> **Vocabulario canónico usado en las etiquetas** (diccionario §3.14): `rooms.publication_status` = `DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`; `rooms.operational_status` = `CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`; `housekeeping_assignments.status` = `PENDING`, `IN_PROGRESS`, `DONE`; `preventive_tasks.validation_status` = `PENDING_VERIFICATION`, `VALIDATED`, `PENDING_VERIFICATION_EXPIRED`. No se usan `AVAILABLE`, `CLEANING`, `LIMPIA`, `SUCIA` ni `VERIFIED`.
>
> Por volumen (45 identificadores CU-V, 8 actores), el modelo se divide en **3 bloques coherentes**: Mantenimiento, Ama de llaves y Transversales/Seguridad.

---

## 1. Bloque Mantenimiento — Jefe de Mantenimiento y Técnico

```mermaid
flowchart LR
    JEFE["Jefe de Mantenimiento<br/>(HEAD_MAINTENANCE)"]
    TECH["Técnico de mantenimiento<br/>(MAINTENANCE_TECH)"]

    subgraph SUITE_M["Suite de Mantenimiento — Jefe de Mantenimiento (HEAD_MAINTENANCE)"]
        direction TB
        CU01(["CU-V-01<br/>Autenticarse en la Suite de Mantenimiento"])
        CU02(["CU-V-02<br/>Recibir, clasificar y asignar incidencias"])
        CU03(["CU-V-03 ⛓<br/>Bloquear habitación para venta → MAINTENANCE"])
        CU04(["CU-V-04<br/>Resolver y cerrar una incidencia"])
        CU05(["CU-V-05 ⛓<br/>Desbloquear habitación → PAUSED + PENDING_CLEANING"])
        CU06(["CU-V-06<br/>Configurar y programar plan preventivo"])
        CU07(["CU-V-07 ⛓<br/>Registrar cumplimiento de tarea preventiva"])
        CU08(["CU-V-08<br/>Registrar mantenimiento rutinario de áreas comunes"])
        CU09(["CU-V-09<br/>Validar tareas de subordinados (SLA 24 h)"])
        CU10(["CU-V-10<br/>Generar informes de mantenimiento"])
    end

    subgraph SUITE_T["Suite de Mantenimiento — Técnico (MAINTENANCE_TECH)"]
        direction TB
        CU12(["CU-V-12<br/>Autenticarse en el terminal (PIN)"])
        CU13(["CU-V-13<br/>Consultar mis incidencias/tareas asignadas"])
        CU14(["CU-V-14<br/>Registrar avance y cierre con evidencia"])
        CU15(["CU-V-15<br/>Reportar incidencia desde el terminal"])
    end

    subgraph EXT_M["Casos encadenados (bloque 2)"]
        direction TB
        CU19X(["CU-V-19<br/>Recibir notificación de habitaciones que requieren limpieza"])
        CU11F(["CU-V-11<br/>(fusionado en CU-V-19)"])
    end

    JEFE --> CU01
    JEFE --> CU02
    JEFE --> CU03
    JEFE --> CU04
    JEFE --> CU05
    JEFE --> CU06
    JEFE --> CU07
    JEFE --> CU08
    JEFE --> CU09
    JEFE --> CU10

    TECH --> CU12
    TECH --> CU13
    TECH --> CU14
    TECH --> CU15

    CU05 -.->|"«include»: notifica al Ama de llaves (CU-V-19)"| CU19X
    CU14 -.->|"«include»: cierre pasa a validación (CU-V-09)"| CU09
    CU11F -.->|"«fusión» (CU-AUD-03)"| CU19X
```

**Nota.** Representa la **Suite de Mantenimiento** (CU-V-01 … CU-V-15). El Jefe de Mantenimiento concentra las acciones con firma on-chain obligatoria (`CU-V-03` bloqueo → `publication_status='MAINTENANCE'`; `CU-V-05` desbloqueo → `publication_status='PAUSED'` + `operational_status='PENDING_CLEANING'`, nunca `PUBLISHED`; `CU-V-07` tareas preventivas de áreas críticas → `validation_status='VALIDATED'`), mientras el Técnico opera en el terminal con PIN y sin wallet. Los `«include»` reflejan pasos del flujo principal documentados (CU-V-05 paso 7 → CU-V-19; CU-V-14 → validación CU-V-09). **CU-V-11 está fusionado en CU-V-19** (CU-AUD-03): no tiene actor propio y se muestra solo como referencia de fusión. El escalado por SLA vencido (CU-V-09 → CU-V-39) y la firma de emergencia (CU-V-38) cruzan a suites y se muestran en el bloque 3.

---

## 2. Bloque Ama de llaves — Ama de llaves y Camarera

```mermaid
flowchart LR
    AMA["Ama de llaves<br/>(HEAD_KEEPER)"]
    CAM["Camarera<br/>(HOUSEKEEPER)"]

    subgraph SUITE_K["Suite Ama de llaves — Ama de llaves (HEAD_KEEPER)"]
        direction TB
        CU16(["CU-V-16<br/>Autenticarse en la Suite Ama de llaves"])
        CU17(["CU-V-17<br/>Crear turnos y asignar habitaciones"])
        CU18(["CU-V-18<br/>Consultar el tablero de estado operativo"])
        CU19(["CU-V-19<br/>Recibir notificación de habitaciones que requieren limpieza"])
        CU20(["CU-V-20<br/>Supervisar el trabajo de las camareras"])
        CU21(["CU-V-21 ⛓ opcional<br/>Inspeccionar y certificar habitación"])
        CU22(["CU-V-22<br/>Rechazar limpieza → asignación PENDING + room DIRTY"])
        CU23(["CU-V-23<br/>Reportar incidencia de mantenimiento"])
        CU24(["CU-V-24<br/>Registrar cargo por daños (sin firma)"])
        CU25(["CU-V-25<br/>Gestionar suministros con alerta de umbral"])
        CU26(["CU-V-26<br/>Generar informes de productividad e inspecciones"])
    end

    subgraph SUITE_C["Suite Ama de llaves — Camarera (HOUSEKEEPER)"]
        direction TB
        CU27(["CU-V-27<br/>Autenticarse en el terminal (PIN)"])
        CU28(["CU-V-28<br/>Consultar mis habitaciones del turno"])
        CU29(["CU-V-29<br/>Registrar limpieza: DIRTY → CLEAN y asignación DONE"])
        CU30(["CU-V-30<br/>Registrar consumo de suministros"])
    end

    subgraph EXT_K["Caso encadenado (bloque 3)"]
        direction TB
        CU41K(["CU-V-41<br/>Recibir notificación de cargo y reclamar"])
    end

    AMA --> CU16
    AMA --> CU17
    AMA --> CU18
    AMA --> CU19
    AMA --> CU20
    AMA --> CU21
    AMA --> CU22
    AMA --> CU23
    AMA --> CU24
    AMA --> CU25
    AMA --> CU26

    CAM --> CU27
    CAM --> CU28
    CAM --> CU29
    CAM --> CU30

    CU21 -.->|"«extend»: result=REJECTED"| CU22
    CU30 -.->|"«include»: evalúa umbral y dispara alerta"| CU25
    CU24 -.->|"«include»: prepara notificación al huésped"| CU41K
```

**Nota.** Representa la **Suite Ama de llaves** (CU-V-16 … CU-V-30). El Ama de llaves gobierna turnos, supervisión, inspección y cargos; la Camarera opera en terminal fijo con PIN (sin wallet, asignación `PENDING → IN_PROGRESS → DONE` y habitación `DIRTY → CLEAN`). La inspección (`CU-V-21`) solo exige firma on-chain si `INSPECTION_REQUIRES_SIGNATURE = TRUE` (D-C23) y, en ningún caso, libera la venta (D-C9/D-C15): `publication_status` permanece `PAUSED`. El `«extend»` cubre el rechazo de limpieza (`result=REJECTED` → CU-V-22, asignación devuelta a `PENDING` y habitación a `DIRTY`) y el `«include»` el encadenado consumo → alerta de suministros (`supply_alerts.status='OPEN'`). La notificación al huésped por daños se completa con CU-V-41 (nodo externo del bloque 3). Las notificaciones de limpieza entrantes provienen de CU-V-19 (que absorbe CU-V-11) y del check-out (`OCCUPIED` → `PENDING_CLEANING`).

---

## 3. Bloque Transversal / Seguridad — Recepción, Administrador/Owner, Huésped y Soporte

```mermaid
flowchart LR
    RECEP["Recepción<br/>(RECEPTION_ROLE)"]
    ADMIN["Administrador / Owner<br/>(DEFAULT_ADMIN_ROLE)"]
    HUESPED["Huésped<br/>(cliente con estancia)"]
    SOPORTE["Soporte<br/>(= Administrador / Owner)"]

    subgraph SUITE_R["Recepción (RECEPTION_ROLE)"]
        direction TB
        CU31(["CU-V-31<br/>Reportar incidencia de mantenimiento"])
        CU32(["CU-V-32<br/>Activar/desactivar la venta manualmente (PUBLISHED/PAUSED)"])
        CU33(["CU-V-33<br/>Resolver reclamación del huésped"])
        CU34(["CU-V-34<br/>Confirmar cargo por daños en el check-out"])
    end

    subgraph SUITE_A["Administrador / Owner (DEFAULT_ADMIN_ROLE)"]
        direction TB
        CU35(["CU-V-35<br/>Gestionar wallets y roles on-chain de jefes"])
        CU36(["CU-V-36<br/>Alta/rotación/baja de operarios de terminal"])
        CU37(["CU-V-37<br/>Gobernar flags de firma on-chain"])
        CU38(["CU-V-38 ⛓<br/>Firmar en emergencia como OWNER_BACKUP"])
        CU39(["CU-V-39<br/>Gestionar tareas vencidas escaladas (PENDING_VERIFICATION_EXPIRED)"])
        CU40(["CU-V-40<br/>Exportar expediente de evidencias y auditoría"])
    end

    subgraph SUITE_H["Huésped"]
        direction TB
        CU41(["CU-V-41<br/>Recibir notificación de cargo y reclamar"])
        CU42(["CU-V-42<br/>Ejercer derechos de acceso y supresión"])
    end

    subgraph SUITE_S["Soporte (= Administrador / Owner)"]
        direction TB
        CU43(["CU-V-43<br/>Supervisar la cola de anclajes"])
        CU44(["CU-V-44<br/>Recuperar PIN de operario de terminal"])
        CU45(["CU-V-45<br/>Restaurar y verificar copias de seguridad"])
    end

    subgraph EXT["Casos gobernados (fuera de este bloque)"]
        direction TB
        CU03X(["CU-V-03 ⛓<br/>Bloquear habitación → MAINTENANCE"])
        CU05X(["CU-V-05 ⛓<br/>Desbloquear → PAUSED + PENDING_CLEANING"])
        CU07X(["CU-V-07 ⛓<br/>Registrar cumplimiento de tarea preventiva"])
        CU09X(["CU-V-09<br/>Validar tareas de subordinados (SLA 24 h)"])
        CU21X(["CU-V-21 ⛓ opcional<br/>Inspeccionar y certificar habitación"])
        CU24X(["CU-V-24<br/>Registrar cargo por daños (sin firma)"])
    end

    RECEP --> CU31
    RECEP --> CU32
    RECEP --> CU33
    RECEP --> CU34

    ADMIN --> CU35
    ADMIN --> CU36
    ADMIN --> CU37
    ADMIN --> CU38
    ADMIN --> CU39
    ADMIN --> CU40

    HUESPED --> CU41
    HUESPED --> CU42

    SOPORTE --> CU43
    SOPORTE --> CU44
    SOPORTE --> CU45

    CU34 -.->|"«extend»: cargo DISPUTED bloquea el cierre"| CU33
    CU41 -.->|"«extend»: reclamación DISPUTED"| CU33
    CU45 -.->|"«include»: reencola firmas SIGNED/PENDING del outbox"| CU43
    CU38 -.->|"«extend»: bloqueo/desbloqueo/verificación crítica"| CU03X
    CU38 -.->|"«extend»"| CU05X
    CU38 -.->|"«extend»"| CU07X
    CU09X -.->|"«extend»: SLA 24 h vencido → PENDING_VERIFICATION_EXPIRED"| CU39
    CU37 -.->|"«include»: INSPECTION_REQUIRES_SIGNATURE"| CU21X
    CU37 -.->|"«include»: DAMAGE_CHARGE_REQUIRES_SIGNATURE"| CU24X
```

**Nota.** Representa los actores transversales y de seguridad (CU-V-31 … CU-V-45). Recepción **no firma on-chain** (D-C37) y es quien activa manualmente la venta (`CU-V-32`, `publication_status='PUBLISHED'`; al desactivar `'PAUSED'`), rechazando con HTTP 409 `RoomBlockedByMaintenance` si la habitación está en `MAINTENANCE` (CU-AUD-10). El Administrador/Owner gobierna wallets, operarios, flags y el respaldo de emergencia `OWNER_BACKUP` (CU-V-38); el Huésped recibe el cargo y ejerce derechos (CU-V-41/CU-V-42), con resolución en Recepción vía `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED` (CU-V-33); el Soporte vigila la cola de anclajes y la continuidad (CU-V-43/CU-V-44/CU-V-45). El subgrafo «Casos gobernados» reutiliza nodos externos para expresar, sin cruzar diagramas, las extensiones `«extend»`/`«include»` documentadas: emergencia sobre CU-V-03/05/07, escalado del SLA de CU-V-09 hacia CU-V-39 y gobierno de flags (CU-V-37) sobre CU-V-21 y CU-V-24.

---

## 4. Resumen de actores y cobertura

| Actor (rol de plataforma) | Wallet | Casos de uso | Bloque |
|---|---|---|---|
| Jefe de Mantenimiento (`HEAD_MAINTENANCE`) | Sí (`HEAD_MAINTENANCE_ROLE`) | CU-V-01 … CU-V-10 (CU-V-11 fusionado en CU-V-19) | 1 |
| Técnico de mantenimiento (`MAINTENANCE_TECH`) | No | CU-V-12 … CU-V-15 | 1 |
| Ama de llaves (`HEAD_KEEPER`) | Sí (`HEAD_KEEPER_ROLE`), solo inspección opcional | CU-V-16 … CU-V-26 | 2 |
| Camarera (`HOUSEKEEPER`) | No | CU-V-27 … CU-V-30 | 2 |
| Recepción (`RECEPTION_ROLE`) | No (D-C37) | CU-V-31 … CU-V-34 | 3 |
| Administrador / Owner (`DEFAULT_ADMIN_ROLE`) | Sí (`OWNER_BACKUP`) | CU-V-35 … CU-V-40 | 3 |
| Huésped | No | CU-V-41, CU-V-42 | 3 |
| Soporte (= Administrador) (`DEFAULT_ADMIN_ROLE`) | Sí | CU-V-43 … CU-V-45 | 3 |

**Cobertura:** 8 actores y **45 identificadores CU-V** (CU-V-01 … CU-V-45) representados; **CU-V-11 fusionado en CU-V-19** (CU-AUD-03), por lo que no tiene actor ni flujo propio. No se añade ningún caso que no figure en `casos_uso.md`.

*Diagrama de casos de uso vNext · Fase 2 · @asistenteProyecto · 2026-10-06 (rev. 1.1.0, vocabulario canónico).*
