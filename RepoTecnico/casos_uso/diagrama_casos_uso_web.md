# Diagrama de casos de uso — WEB (implementación F1–F10)

> **Tipo:** representación gráfica UML de casos de uso en **Mermaid** (Fase 2).
> **Fuente única:** [`RepoTecnico/casos_uso_web.md`](../casos_uso_web.md) (CU-W-01…CU-W-24, actores y
> objetivos literales del §2/§3). Los CU heredados (`CU-01…CU-50`, `CU-V-01…CU-V-45`) se consolidan en el
> §5 de ese documento y **no se repiten** en estos diagramas.
> **Fecha:** 2026-10-20 · **Versión:** 1.0.0.
>
> **Convenciones**
> - Rectángulo = **actor** (rol entre paréntesis).
> - Esquinas redondeadas = **caso de uso** `CU-W-XX` con el objetivo literal.
> - `-->` = asociación actor → caso de uso; `-.->` = relación UML **«include»**/**«extend»**, rotulada.
> - ⛓ = caso con **firma on-chain selectiva** (requiere wallet + preview; RF-S-07).
> - Por volumen (24 CU-W, 8 actores) el modelo se divide en **3 bloques**: público/huésped, back-office
>   y operación, y suites de personal (referencia a `propuesta_vNext/casos_uso.md`).

---

## 1. Bloque público y huésped

```mermaid
flowchart LR
    VIS["Visitante"]
    COMP["Comprador / Huésped<br/>(wallet)"]
    PORT["Portador de noches<br/>(wallet propietaria)"]

    subgraph PUB["Web pública"]
        direction TB
        W01(["CU-W-01<br/>Explorar la home y secciones"])
        W02(["CU-W-02<br/>Consultar catálogo y filtrar"])
        W03(["CU-W-03<br/>Consultar disponibilidad y reservar"])
        W04(["CU-W-04<br/>Onboarding web3"])
        W05(["CU-W-05 ⛓<br/>Comprar venta primaria"])
        W06(["CU-W-06 ⛓<br/>Comprar reventa con royalty"])
        W07(["CU-W-07 ⛓<br/>Listar/editar/retirar reventa"])
        W08(["CU-W-08 ⛓<br/>Cobrar reventas"])
        W09(["CU-W-09<br/>Mis noches + resguardo QR"])
        W10(["CU-W-10<br/>Check-in / check-out"])
        W12(["CU-W-12<br/>Portal de cargos por daños"])
        W13(["CU-W-13<br/>Histórico público"])
        W14(["CU-W-14 ⛓<br/>Subastas: pujar y liquidar"])
        W15(["CU-W-15<br/>Escribir reseña"])
        W16(["CU-W-16 ⛓<br/>Asistente IA (compra)"])
        W17(["CU-W-17<br/>Manuales y ayuda"])
        W18(["CU-W-18<br/>Avisos email/push"])
    end

    VIS --> W01
    VIS --> W02
    VIS --> W13
    VIS --> W17
    VIS --> W16
    COMP --> W04
    COMP --> W03
    COMP --> W05
    COMP --> W14
    COMP --> W16
    PORT --> W09
    PORT --> W07
    COMP --> W06
    PORT --> W08
    PORT --> W12
    PORT --> W15

    W04 -.->|"«include»: requisito para comprar"| W05
    W03 -.->|"«include»: disponibilidad"| W02
    W09 -.->|"«include»: resguardo"| W10
    W05 -.->|"«include»: aviso por email"| W18
    W07 -.->|"«include»: verificar propiedad"| W09
    W14 -.->|"«include»: verificar disponibilidad"| W02
```

**Notas.** La compra primaria/reventa y la subasta son las únicas acciones de escritura on-chain del
huésped (⛓), además de listar/cobrar reventas; el resto es lectura o escritura off-chain auditada.
`CU-W-10` es un objetivo compartido: el huésped muestra el pase y la **recepción** ejecuta el check-in
(ver bloque 2).

---

## 2. Bloque recepción, back-office y operación

```mermaid
flowchart LR
    REC["Recepcionista<br/>(RECEPTION_ROLE)"]
    OWN["Administrador / Owner<br/>(DEFAULT_ADMIN_ROLE)"]
    SOP["Soporte (= Owner)"]
    OPS["Operador de plataforma"]
    SYS["Sistema<br/>(worker, monitor, MCP)"]

    subgraph RECEP["Recepción"]
        direction TB
        W10(["CU-W-10<br/>Check-in / check-out"])
        W11(["CU-W-11<br/>Operar el día"])
    end

    subgraph ADMIN["Back-office / Administración"]
        direction TB
        W19(["CU-W-19<br/>Acceder (password + TOTP)"])
        W20(["CU-W-20 ⛓<br/>Habitaciones: publicar y acuñar"])
        W21(["CU-W-21<br/>Contenido y actividades"])
        W22(["CU-W-22<br/>Moderar reseñas"])
        W23(["CU-W-23 ⛓<br/>Gobernar la plataforma"])
        W24(["CU-W-24<br/>Supervisar la operación"])
    end

    REC --> W11
    REC --> W10
    OWN --> W20
    OWN --> W21
    OWN --> W22
    OWN --> W23
    OWN --> W24
    SOP --> W23
    OPS --> W24
    SYS --> W24

    W10 -->|"«include»: liberar habitación (CU-38)"| W11
    W11 -->|"«include»: validar pase JWS"| W10
    W20 -.->|"«precede»: acuñar ventana"| W24
    W23 -.->|"«include»: auditoría firmada (A10)"| W24
    W24 -.->|"«include»: health worker/RPC"| SYS
    W19 -.->|"«include»: toda la administración"| W20
```

**Notas.** `CU-W-23` se mantiene como **paraguas** de gobernanza (subcasos 23.1–23.6: usuarios, wallets
on-chain, flags, operarios de terminal, auditoría/backups y subastas). El owner satisface cualquier
requisito de rol (D-30). Las suites de personal no se dibujan aquí: ver bloque 3.

---

## 3. Bloque suites de personal (referencia consolidada)

```mermaid
flowchart LR
    JEFEM["Jefe de Mantenimiento<br/>(HEAD_MAINTENANCE)"]
    TEC["Técnico<br/>(MAINTENANCE_TECH / MAINTENANCE)"]
    JEFEK["Jefa de Ama de llaves<br/>(HEAD_KEEPER)"]
    CAM["Camarera<br/>(HOUSEKEEPER / HOUSEKEEPING)"]

    subgraph SUITES["Suites de personal — detalle en propuesta_vNext/casos_uso.md"]
        direction TB
        MV(["CU-V-01…CU-V-10<br/>Suite de Mantenimiento (jefe)"])
        MT(["CU-V-12…CU-V-15<br/>Terminal de mantenimiento (técnico)"])
        KV(["CU-V-16…CU-V-26<br/>Suite Ama de llaves (jefa)"])
        CT(["CU-V-27…CU-V-31<br/>Terminal de housekeeping (camarera)"])
        CROSS(["CU-V-32…CU-V-45<br/>Recepción vNext, gobernanza y soporte"])
    end

    JEFEM --> MV
    TEC --> MT
    JEFEK --> KV
    CAM --> CT
    JEFEM --> CROSS
    JEFEK --> CROSS
    MV -.->|"«include»: notificación a limpieza (CU-V-19)"| KV
    MT -.->|"«include»: validación del jefe (CU-V-09)"| MV
    CT -.->|"«include»: inspección (CU-V-21)"| KV
```

> Los criterios Gherkin/EARS de los 45 CU-V viven en
> [`propuesta_vNext/casos_uso.md`](../propuesta_vNext/casos_uso.md); su estado de implementación y
> evidencia están consolidados en [`casos_uso_web.md`](../casos_uso_web.md) §5.3.

---

## 4. Relaciones «include»/«extend» relevantes (resumen)

| Relación | Desde → hacia | Tipo | Motivo |
|---|---|---|---|
| Comprar exige onboarding | CU-W-05 → CU-W-04 | include | sin wallet/red no se puede firmar |
| Reservar exige catálogo | CU-W-03 → CU-W-02 | include | la disponibilidad se elige sobre el catálogo |
| Resguardo para check-in | CU-W-09 → CU-W-10 | include | el pase es la entrada al check-in |
| Aviso tras la compra | CU-W-05 → CU-W-18 | include | email/push al comprador y al admin |
| Editar precio de reventa | CU-W-07 → CU-W-06 | extend | solo si ya está listada |
| Subasta exige disponibilidad | CU-W-14 → CU-W-02 | include | la noche debe ser vendible |
| Administración exige sesión | CU-W-20…24 → CU-W-19 | include | gate de sesión en servidor |
| Auditoría en la gobernanza | CU-W-23 → CU-W-24 | include | export/cola verificables |
| Check-out libera habitación | CU-W-10 → CU-W-11 | include | estado operativo `PENDING_CLEANING` |
