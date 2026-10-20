# Diagrama de casos de uso — APK Android del huésped (v1)

> **Tipo:** representación gráfica UML de casos de uso en **Mermaid** (Fase 2).
> **Fuente única:** [`RepoTecnico/casos_uso_apk.md`](../casos_uso_apk.md) (CU-A-01…CU-A-24 y decisiones
> ratificadas A-1/A-2/A-3).
> **Fecha:** 2026-10-20 · **Versión:** 1.0.0.
>
> **Convenciones**
> - Rectángulo = actor; esquinas redondeadas = caso de uso `CU-A-XX`.
> - `-->` asociación; `-.->` «include»/«extend» rotulado.
> - ⛓ = firma en wallet (no custodial); 📴 = funciona sin conexión; 🔒 = requiere protección del
>   dispositivo (biometría/Keystore).
> - Por volumen (24 CU-A) se divide en **2 bloques**: viaje del huésped y protección/plataforma.

---

## 1. Bloque viaje del huésped

```mermaid
flowchart LR
    VIS["Visitante"]
    COMP["Huésped / Comprador<br/>(wallet)"]
    PORT["Portador<br/>(wallet con noches)"]
    RECEP["Recepción (externo)<br/>web de recepción"]

    subgraph ONB["Onboarding y acceso"]
        direction TB
        A01(["CU-A-01<br/>Instalar y onboarding"])
        A02(["CU-A-02<br/>Conectar wallet (WC v2)"])
        A03(["CU-A-03<br/>Red del proyecto"])
    end

    subgraph COMPRA["Descubrir y comprar"]
        direction TB
        A04(["CU-A-04 📴<br/>Catálogo y filtros"])
        A05(["CU-A-05<br/>Ficha de la noche"])
        A06(["CU-A-06<br/>Disponibilidad y reserva"])
        A07(["CU-A-07 ⛓<br/>Compra primaria"])
        A08(["CU-A-08 ⛓<br/>Compra reventa"])
        A13(["CU-A-13 ⛓<br/>Subastas"])
    end

    subgraph POST["Post-venta y estancia"]
        direction TB
        A09(["CU-A-09<br/>Mis noches"])
        A10(["CU-A-10 📴🔒<br/>Resguardo QR offline"])
        A11(["CU-A-11<br/>Check-in y estancia"])
        A12(["CU-A-12 ⛓<br/>Gestionar reventas y cobrar"])
        A14(["CU-A-14<br/>Escribir reseña"])
        A15(["CU-A-15<br/>Cargos y reclamación"])
        A16(["CU-A-16<br/>Notificaciones push"])
        A17(["CU-A-17<br/>Deep links"])
    end

    VIS --> A01
    VIS --> A04
    VIS --> A05
    COMP --> A02
    COMP --> A03
    COMP --> A06
    COMP --> A07
    COMP --> A08
    COMP --> A13
    PORT --> A09
    PORT --> A10
    PORT --> A11
    PORT --> A12
    PORT --> A14
    PORT --> A15
    PORT --> A16
    VIS --> A17
    RECEP -->|"valida el QR"| A11

    A01 -.->|"«include»: aceptar términos/privacidad"| A02
    A02 -.->|"«include»: red correcta"| A03
    A05 -.->|"«include»: catálogo"| A04
    A07 -.->|"«include»: wallet + red"| A02
    A08 -.->|"«include»: wallet + red"| A02
    A12 -.->|"«include»: posesión verificada"| A09
    A10 -.->|"«include»: pase emitido por el backend"| A09
    A11 -.->|"«include»: resguardo"| A10
    A16 -.->|"«extend»: abre el detalle del aviso"| A17
    A14 -.->|"«include»: noche consumida"| A09
```

**Notas.** `CU-A-02/03` son requisito de toda operación con firma (⛓). El **resguardo** (CU-A-10) es el
único caso que debe funcionar **sin red** (📴) y bajo **bloqueo del dispositivo** (🔒); el check-in lo
ejecuta la web de recepción, no la app.

---

## 2. Bloque protección, privacidad y plataforma

```mermaid
flowchart LR
    HUE["Huésped"]
    SYS["Sistema<br/>(FCM, backend, Play)"]

    subgraph SEG["Seguridad y confianza"]
        direction TB
        A18(["CU-A-18 🔒<br/>Bloqueo biométrico y Keystore"])
        A23(["CU-A-23<br/>Actualizaciones y compatibilidad"])
        A24(["CU-A-24<br/>Diagnóstico y salud"])
    end

    subgraph PRIV["Privacidad y soporte"]
        direction TB
        A19(["CU-A-19 📴<br/>Modo offline y recuperación"])
        A20(["CU-A-20<br/>Idioma y accesibilidad"])
        A21(["CU-A-21<br/>Derechos GDPR"])
        A22(["CU-A-22 📴<br/>Ayuda y soporte"])
    end

    HUE --> A18
    HUE --> A19
    HUE --> A20
    HUE --> A21
    HUE --> A22
    HUE --> A23
    SYS --> A24

    A18 -.->|"«include»: protege"| A19
    A18 -.->|"«include»: protege"| A21
    A21 -.->|"«include»: exportar/borrar datos"| A19
    A23 -.->|"«include»: versión mínima remota"| A24
    A24 -.->|"«extend»: diagnóstico para soporte"| A22
```

**Notas.** `CU-A-18` aplica **biometría obligatoria** y **Play Integrity opcional** (decisión A-3); con
Integrity activo y dispositivo no aprobado, la app queda en solo lectura. `CU-A-24` no persiste PII.

---

## 3. Relaciones «include»/«extend» relevantes (resumen)

| Relación | Desde → hacia | Tipo | Motivo |
|---|---|---|---|
| Onboarding exige términos | CU-A-01 → CU-A-02 | include | sin aceptación no se conecta wallet |
| Toda compra exige wallet/red | CU-A-07/08/13 → CU-A-02/03 | include | no se firma sin wallet en red 81234 |
| Resguardo exige pase emitido | CU-A-10 → CU-A-09 | include | el pase lo emite el backend |
| Check-in exige resguardo | CU-A-11 → CU-A-10 | include | el QR es la entrada |
| Push abre detalle | CU-A-16 → CU-A-17 | extend | solo si el usuario toca la notificación |
| Protección cubre datos | CU-A-18 → CU-A-19/21 | include | Keystore/biometría sobre caché y datos |
| Actualización obligatoria | CU-A-23 → CU-A-24 | include | versión mínima desde backend |
| GDPR usa export local | CU-A-21 → CU-A-19 | include | exportar/borrar datos guardados |
