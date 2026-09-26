# Requerimientos · Incremento v2 (owner · recepción · reventa)

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable-DSH`)
> **Base**: Fase 3 con M0–M9 cerrados. Este documento captura el **incremento funcional** pedido por el
> responsable el 2026-09-25 y las decisiones de la entrevista de arranque.
> **Regla de oro**: no se cambia el contrato canónico `HotelNights` salvo la decisión D-30 (ninguna lo hace).

---

## 1. Decisiones de la entrevista (cerradas)

| ID | Decisión | Valor elegido |
|---|---|---|
| D-30 | Qué es «la cuenta del owner» y cómo obtiene acceso total | `admin@hotel.es` con `DEFAULT_ADMIN_ROLE` actúa como owner y debe poder operar **todos** los paneles del back-office. Sin cambios en el contrato. |
| D-31 | Fuente de datos del MVP de recepción | **Solo PostgreSQL** (`nfts` + maestro de 50 habitaciones). Sin barrido on-chain en la carga de la vista. |
| D-32 | «Código de recuperación» del check-in | Código de reserva del huésped que permite localizar su reserva cuando el QR falla. |
| D-33 | Persistencia del check-out y los cargos | **Off-chain en PostgreSQL**: tablas de check-out, incidencias y cargos. El contrato no cambia. |
| D-34 | Alta de cargos adicionales | La realiza **recepción** desde la propia pantalla de check-out. |
| D-35 | Alcance del MVP de reventa | Añadir «Mis reventas» con publicar/editar/retirar y avisos. |
| D-36 | Avisos de reventa | **In-app** en «Mis reventas» + **Web Push anónimo** ya existente. No se recoge email (se mantiene el diseño PII-free). |
| D-37 | Sesión de la página `/recepcion` | Exige sesión de `RECEPTION_ROLE` **o** owner en toda la página. |

---

## 2. Requerimientos funcionales (RF)

### 2.1 Incremento 1 — Owner con acceso total

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-30 | El sistema deberá tratar la sesión con `DEFAULT_ADMIN_ROLE` (owner) como habilitada para **todos** los paneles del back-office: Publicar noche (MINTER), Dashboard, Royalty, Pausa (PAUSER), Fondos (TREASURER), Caducadas (BURNER) y Roles. | Alta |
| RF-30.1 | La sesión con `RECEPTION_ROLE` **no** deberá habilitarse para los paneles de administración (mint, pausa, fondos, caducadas, roles). | Alta |
| RF-30.2 | La ampliación de permisos deberá ser **cosmética/UX y de API**, nunca una elevación on-chain: la última palabra la sigue teniendo `hasRole` del contrato al firmar. | Alta |

### 2.2 Incremento 2 — MVP de recepción

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-31 | La recepción deberá ver un **panel del día** con las reservas correspondientes a la fecha seleccionada (por defecto hoy): habitación, tipo, estado, titular (wallet) y token. | Alta |
| RF-32 | La recepción deberá ver el **estado de las 50 habitaciones** del maestro para la fecha seleccionada, derivado del índice PostgreSQL. | Alta |
| RF-33 | El sistema deberá permitir el **check-in** por resguardo QR/JWS (existente) y una **búsqueda de reserva por código de recuperación** (`MDS-…`) que muestre la reserva antes de confirmar («comprobación de reserva»). | Alta |
| RF-33.1 | El código de recuperación deberá **persistirse** en `nfts.recovery_code`, ser único y estable para el token, y poder regenerarse/rellenarse de forma determinista. | Alta |
| RF-34 | La recepción deberá disponer de una sección de **check-out** con formulario de verificación de la habitación (estado, incidencias) y **cancelación de cargos adicionales**. | Alta |
| RF-34.1 | El check-out deberá registrarse en PostgreSQL (`stay_checkouts` + `checkout_incidents`), marcar la noche como `CHECKED_OUT` y ser **idempotente** (un segundo check-out no duplica el registro). | Alta |
| RF-35 | La recepción deberá poder **añadir cargos adicionales** (`additional_charges`) a una estancia y cancelarlos desde el check-out. | Media |
| RF-38 | La página `/recepcion` deberá exigir sesión (`RECEPTION_ROLE` o owner) en toda su superficie. | Alta |

### 2.3 Incremento 3 — MVP de mercado de reventas

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-36 | «Mis reventas» deberá mostrar las noches que el usuario tiene **publicadas** (con precio y antigüedad) y las **vendidas** (con su histórico y saldo pendiente), y permitir **publicar, editar el precio y retirar** el listado. | Alta |
| RF-36.1 | Las acciones reutilizarán el punto único de verdad on-chain (`list`/`unlist`/`buyResale`) ya existente; no se duplica lógica de firma. | Alta |
| RF-37 | El sistema deberá mostrar **avisos in-app** de cambios de estado de las reventas del usuario (publicada, vendida, retirada) y **Web Push anónimo** a quien lo tenga activado. | Media |
| RF-37.1 | No se recogerá ni almacenará email ni dato personal del huésped para los avisos (RNF-30). | Alta |

---

## 3. Requerimientos no funcionales (RNF)

| ID | Requerimiento | Métrica / criterio |
|---|---|---|
| RNF-30 | **Privacidad / PII-free**: ninguna tabla ni pantalla nueva guarda nombre, DNI, email o teléfono del huésped. | 0 columnas PII nuevas; guardián `secrets-guardian`/revisión. |
| RNF-31 | **Autorización en servidor**: toda ruta nueva de recepción exige `RECEPTION_ROLE` o owner; ninguna lectura sensible queda pública. | 401 sin token, 403 con rol insuficiente. |
| RNF-32 | **Accesibilidad WCAG 2.1 AA**: las pantallas nuevas usan la paleta del proyecto y nombres accesibles; `<table>`/roles para los listados. | Pares texto/fondo ≥ 4.5:1 (suite `lib/a11y`). |
| RNF-33 | **Trazabilidad**: cada check-out y cada cargo guardan quién (`processed_by`/`created_by`), cuándo y sobre qué token. | Columnas de auditoría no nulas. |
| RNF-34 | **Idempotencia**: reintentar un check-out ya registrado devuelve el registro existente, sin duplicar. | Restricción única por `token_id`. |
| RNF-35 | **i18n**: los textos nuevos existen en ES/EN/RU. | Claves presentes en los 3 `messages/*.json`. |
| RNF-36 | **Regresión**: `pnpm typecheck` y las suites de test existentes siguen en verde. | CI local. |

---

## 4. Trazabilidad RF → Casos de uso → Módulos

| RF | Caso de uso | Módulo/Hito |
|---|---|---|
| RF-30, RF-30.1, RF-30.2 | CU-30 | H1 · `adminNav`, `useAdminSession`, `AdminPanel`, guardián |
| RF-31, RF-32 | CU-31 | H2–H4 · `NFTsRepository`, `/api/reception/overview`, UI recepción |
| RF-33, RF-33.1 | CU-32, CU-33 | H2–H4 · `recovery_code`, `/api/reception/reservations/lookup`, UI |
| RF-34, RF-34.1 | CU-34 | H2–H4 · `stay_checkouts`, `/api/reception/checkout`, UI |
| RF-35 | CU-35 | H2–H4 · `additional_charges`, `/api/reception/charges` |
| RF-36, RF-36.1 | CU-36 | H5 · `/mis-noches/mis-reventas`, `useMyResales` |
| RF-37, RF-37.1 | CU-37 | H5 · avisos in-app + `push/service` |
| RF-38 | CU-31..CU-35 | H3–H4 · `guard.ts` + `ReceptionGate` |

---

## 5. Fuera de alcance (declarado)

- Cambios en el contrato `HotelNights` o su despliegue.
- Integración real con el PMS del hotel (el registro de viajeros RD 933/2021 sigue en el mostrador).
- Notificaciones por email al huésped (no hay email; decisión D-36).
- Cobro/pasarela de los cargos adicionales: el MVP los registra y cancela, no los cobra.
- Multi-hotel / multi-propiedad.

---

## 6. Preguntas resueltas en la entrevista

1. ¿Owner = `admin@hotel.es` con `DEFAULT_ADMIN_ROLE`? → **Sí** (D-30).
2. ¿Datos de recepción desde PostgreSQL? → **Sí, solo PostgreSQL** (D-31).
3. ¿Qué es el código de recuperación? → **Código de reserva del huésped** (D-32).
4. ¿Check-out off-chain? → **Sí, PostgreSQL** (D-33).
5. ¿Quién crea cargos? → **Recepción** (D-34).
6. ¿Alcance reventa? → **«Mis reventas» + publicar/editar/retirar** (D-35).
7. ¿Avisos? → **In-app + push anónimo** (D-36).
8. ¿Sesión en `/recepcion`? → **Sí, RECEPTION_ROLE u owner** (D-37).
